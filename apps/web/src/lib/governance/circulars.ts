import { createHash } from "node:crypto";

import type { GovernanceValidationReport } from "@pi-dash/db/schema/governance";
import {
  boardOn,
  matchSignerToTrustee,
  type RegisterInput,
  RESOLUTION_THRESHOLD_LABELS,
  TRUSTEE_OFFICE_LABELS,
} from "@pi-dash/shared/governance";
import {
  effectProblem,
  effectSubject,
  mayIssueCircular,
  neededFor,
  RESOLUTION_TEMPLATES,
  type ResolutionEffect,
  type ResolutionTemplateKey,
  signatureFieldBox,
  signaturePageCount,
  signatureSlots,
  thresholdFor,
  VOTE_REAUTH_MESSAGE,
  VOTE_SESSION_MAX_AGE_MS,
} from "@pi-dash/shared/resolutions";

import { assertOwnedTemporaryUploadKey } from "../temporary-upload";

/**
 * Circular resolutions on the server: issuing (checks, PDF, signature
 * fields, storage), and taking a trustee's Acrobat-signed PDF. The database
 * work is in packages/db/src/queries/resolutions.ts; this module wires it to
 * R2, the PDF renderer and the signing service through injected deps so the
 * rules are testable.
 */

export class CircularError extends Error {}

/** Voting needs a sign-in from the last 10 minutes (governance.md, decisions). */
export function assertRecentSignIn(
  session: { session: { createdAt: Date | string } },
  now: Date = new Date()
): void {
  const createdAt = new Date(session.session.createdAt).getTime();
  if (!(now.getTime() - createdAt <= VOTE_SESSION_MAX_AGE_MS)) {
    throw new CircularError(VOTE_REAUTH_MESSAGE);
  }
}

export interface DraftRow {
  body: string;
  effect: ResolutionEffect;
  id: string;
  status: string;
  templateKey: ResolutionTemplateKey;
  title: string;
}

export interface IssuePlan {
  issuerName: string;
  issuerOffice: string;
  issuerTrusteeId: string;
  responders: { fieldName: string; trusteeId: string; userId: string | null }[];
  signers: { name: string; offices: string; trusteeId: string }[];
  threshold: ReturnType<typeof thresholdFor>;
  thresholdText: string;
}

/**
 * Everything checked before a circular goes out: the issuer, the board, the
 * template's register change, and whether the threshold can be reached.
 */
export function planIssue(input: {
  draft: DraftRow;
  issuer: { trusteeId: string } | null;
  register: RegisterInput<{
    id: string;
    isCoFounder: boolean;
    legalName: string;
    userId: string | null;
  }>;
  today: string;
  effectRegisterProblem: (
    register: RegisterInput,
    effect: ResolutionEffect
  ) => string | null;
}): IssuePlan {
  const { draft, register, today } = input;
  if (draft.status !== "draft") {
    throw new CircularError("Only a draft can be issued.");
  }
  if (!draft.body.trim()) {
    throw new CircularError("Write the resolution's text before issuing it.");
  }
  const template = RESOLUTION_TEMPLATES[draft.templateKey];
  const issuers = register.rules.circularIssuers
    .map((office) => TRUSTEE_OFFICE_LABELS[office])
    .join(" or ");
  if (!input.issuer) {
    throw new CircularError(
      `Only the ${issuers} can issue a circular, and your account isn't linked to a trustee.`
    );
  }
  if (!mayIssueCircular(register, input.issuer.trusteeId, today)) {
    throw new CircularError(
      `Only the ${issuers} can issue a circular (clause 4.18).`
    );
  }
  const board = boardOn(register, today);
  if (
    board.length < register.rules.minTrustees &&
    !template.allowedBelowMinimum
  ) {
    throw new CircularError(
      `The board has fewer than ${register.rules.minTrustees} trustees, so it may only act to fill vacancies (clause 4.14).`
    );
  }
  const ownProblem = effectProblem(template, draft.effect);
  if (ownProblem) {
    throw new CircularError(ownProblem);
  }
  const registerProblem = input.effectRegisterProblem(register, draft.effect);
  if (registerProblem) {
    throw new CircularError(registerProblem);
  }
  const threshold = thresholdFor(template, register.rules);
  const subject = effectSubject(draft.effect);
  const eligible = board.filter(
    (m) => !(threshold === "unanimous_others" && m.trustee.id === subject)
  ).length;
  const needed = neededFor(threshold, eligible);
  if (eligible === 0 || needed > eligible) {
    throw new CircularError("No trustee is left who can vote on it.");
  }
  const issuerMember = board.find(
    (m) => m.trustee.id === input.issuer?.trusteeId
  );
  const slots = signatureSlots(board.map((m) => m.trustee.id));
  return {
    issuerName: issuerMember?.trustee.legalName ?? "",
    issuerOffice:
      issuerMember?.offices
        .filter((o) => register.rules.circularIssuers.includes(o))
        .map((o) => TRUSTEE_OFFICE_LABELS[o])[0] ?? "",
    issuerTrusteeId: input.issuer.trusteeId,
    responders: board.map((m, index) => ({
      fieldName: slots[index]?.fieldName ?? "",
      trusteeId: m.trustee.id,
      userId:
        register.trustees.find((t) => t.id === m.trustee.id)?.userId ?? null,
    })),
    signers: board.map((m) => ({
      name: m.trustee.legalName,
      offices: m.offices.map((o) => TRUSTEE_OFFICE_LABELS[o]).join(", "),
      trusteeId: m.trustee.id,
    })),
    threshold,
    thresholdText: `${RESOLUTION_THRESHOLD_LABELS[threshold]} (${needed} of ${eligible})`,
  };
}

/** The empty signature fields to add, one per signer, on the last pages. */
export function fieldRequests(trusteeIds: readonly string[]) {
  const pages = signaturePageCount(trusteeIds.length);
  return signatureSlots(trusteeIds).map((slot) => ({
    box: signatureFieldBox(slot),
    name: slot.fieldName,
    page: slot.pageOffset - pages,
  }));
}

/** Short reference printed on the circular before it has a register number. */
export function circularReference(resolutionId: string): string {
  return `C-${resolutionId.replaceAll("-", "").slice(-8).toUpperCase()}`;
}

export function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// ── Taking a signed PDF ─────────────────────────────────────────────────────

export interface SignedUploadCheck {
  current: Uint8Array;
  fieldName: string;
  report: GovernanceValidationReport;
  signedBefore: number;
  trustee: { id: string; names: string[] };
  uploaded: Uint8Array;
}

/**
 * Checks a trustee's signed PDF against the one they downloaded: it must be
 * that file with exactly one more signature appended (an incremental
 * update), the new signature must be intact and cover the whole file, sit in
 * the trustee's own field when the PDF has fields, and be theirs by name;
 * every earlier signature must still be intact. Returns the new signature.
 */
export function checkSignedUpload(
  check: SignedUploadCheck
): GovernanceValidationReport["signatures"][number] {
  const { current, uploaded, report } = check;
  if (uploaded.byteLength <= current.byteLength) {
    throw new CircularError(
      "This file has no new signature. Sign your box in Acrobat and upload the saved copy."
    );
  }
  for (let i = 0; i < current.byteLength; i++) {
    if (uploaded[i] !== current[i]) {
      throw new CircularError(
        "This isn't the latest copy of the circular with your signature added. Download it again, sign it and upload the saved file without other changes."
      );
    }
  }
  if (report.status === "unavailable") {
    throw new CircularError(
      report.message ?? "The signature couldn't be checked right now."
    );
  }
  if (report.signatures.length !== check.signedBefore + 1) {
    throw new CircularError("Add exactly one signature: yours, in your box.");
  }
  const added = report.signatures.at(-1);
  if (!added) {
    throw new CircularError("No signature was found in the file.");
  }
  const fieldNames = report.signatures.map((s) => s.fieldName);
  if (
    fieldNames.includes(check.fieldName) &&
    added.fieldName !== check.fieldName
  ) {
    throw new CircularError("Sign in the box with your own name.");
  }
  if (!(added.intact && added.coversWholeRevision)) {
    throw new CircularError(
      "Your signature doesn't check out: the file changed after it was signed."
    );
  }
  if (report.signatures.slice(0, -1).some((s) => !s.intact)) {
    throw new CircularError("An earlier signature no longer checks out.");
  }
  if (
    matchSignerToTrustee(added.signerName, [check.trustee]) !== check.trustee.id
  ) {
    throw new CircularError(
      `The certificate is in the name of ${added.signerName ?? "someone else"}, not yours. Sign with your own DSC.`
    );
  }
  return added;
}

/** Whether the bytes are a temporary governance upload of this user. */
export function assertOwnSignedUpload(
  key: string,
  owner: { keyPrefix: string; userId: string }
): string {
  const owned = assertOwnedTemporaryUploadKey(key, owner);
  if (!owned.startsWith(`${owner.keyPrefix}/governance/tmp/`)) {
    throw new Error("Forbidden");
  }
  return owned;
}
