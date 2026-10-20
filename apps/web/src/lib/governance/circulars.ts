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
  answersFieldBox,
  answersFieldName,
  CIRCULAR_RESOLUTIONS_MAX,
  SIGNATURE_FIELD_PREFIX,
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
  kind: string;
  status: string;
  templateKey: ResolutionTemplateKey;
  title: string;
}

export interface IssuePlan {
  issuerName: string;
  issuerOffice: string;
  issuerTrusteeId: string;
  responders: { fieldName: string; trusteeId: string; userId: string | null }[];
  /** The drafts in order, each with the threshold it passes by. */
  resolutions: {
    id: string;
    threshold: ReturnType<typeof thresholdFor>;
    thresholdText: string;
  }[];
  signers: { name: string; offices: string; trusteeId: string }[];
}

/**
 * Everything checked before a circular goes out: the issuer, the board,
 * and for each draft in order its template's register change (as the
 * register would stand after the ones before it pass) and whether its
 * threshold can be reached.
 */
export function planIssue(input: {
  drafts: readonly DraftRow[];
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
  registerAfterEffect: (
    register: RegisterInput,
    effect: ResolutionEffect,
    ids: { officeId: string; termId: string }
  ) => RegisterInput;
}): IssuePlan {
  const { drafts, register, today } = input;
  if (drafts.length === 0) {
    throw new CircularError("Choose at least one draft to issue.");
  }
  if (drafts.length > CIRCULAR_RESOLUTIONS_MAX) {
    throw new CircularError(
      `A circular can carry up to ${CIRCULAR_RESOLUTIONS_MAX} resolutions.`
    );
  }
  if (new Set(drafts.map((d) => d.id)).size !== drafts.length) {
    throw new CircularError("A draft can only be in the circular once.");
  }
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
  let after: RegisterInput = register;
  const resolutions = drafts.map((draft, index) => {
    // Several drafts: say which one a refusal is about.
    const about = (message: string) =>
      new CircularError(
        drafts.length > 1
          ? `Resolution ${index + 1} ("${draft.title}"): ${message}`
          : message
      );
    if (draft.status !== "draft") {
      throw about("Only a draft can be issued.");
    }
    if (draft.kind !== "circular") {
      throw about("It's on a meeting's agenda and is decided there.");
    }
    if (!draft.body.trim()) {
      throw about("Write the resolution's text before issuing it.");
    }
    const template = RESOLUTION_TEMPLATES[draft.templateKey];
    if (
      board.length < register.rules.minTrustees &&
      !template.allowedBelowMinimum
    ) {
      throw about(
        `The board has fewer than ${register.rules.minTrustees} trustees, so it may only act to fill vacancies (clause 4.14).`
      );
    }
    const problem =
      effectProblem(template, draft.effect) ??
      input.effectRegisterProblem(after, draft.effect);
    if (problem) {
      throw about(problem);
    }
    after = input.registerAfterEffect(after, draft.effect, {
      officeId: `__office_${String(index)}__`,
      termId: `__term_${String(index)}__`,
    });
    const threshold = thresholdFor(template, register.rules);
    const subject = effectSubject(draft.effect);
    const eligible = board.filter(
      (m) => !(threshold === "unanimous_others" && m.trustee.id === subject)
    ).length;
    const needed = neededFor(threshold, eligible);
    if (eligible === 0 || needed > eligible) {
      throw about("No trustee is left who can vote on it.");
    }
    return {
      id: draft.id,
      threshold,
      thresholdText: `${RESOLUTION_THRESHOLD_LABELS[threshold]} (${needed} of ${eligible})`,
    };
  });
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
    resolutions,
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
  };
}

/**
 * The empty fields to add, on the last pages: per signer a signature box
 * and, under their name, the read-only field their answers go into.
 */
export function fieldRequests(trusteeIds: readonly string[]) {
  const pages = signaturePageCount(trusteeIds.length);
  return signatureSlots(trusteeIds).map((slot) => ({
    answersBox: answersFieldBox(slot),
    answersName: answersFieldName(slot.trusteeId),
    box: signatureFieldBox(slot),
    name: slot.fieldName,
    page: slot.pageOffset - pages,
  }));
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
  /** The text fields of `current`: the answers, which signing mustn't change. */
  textFieldsBefore: Record<string, string>;
  trustee: { id: string; names: string[] };
  uploaded: Uint8Array;
}

/**
 * Checks a trustee's signed PDF against the one they downloaded: it must be
 * that file with exactly one more signature appended (an incremental
 * update), the new signature must be intact and cover the whole file, sit in
 * the trustee's own field when the PDF has fields, and be theirs by name;
 * every earlier signature must still be intact, and every answers field as
 * it was. Returns the new signature.
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
  // Another trustee's box is theirs; a new field (a box drawn on a circular
  // without fields) is fine.
  if (
    added.fieldName !== check.fieldName &&
    added.fieldName.startsWith(SIGNATURE_FIELD_PREFIX)
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
  const after = report.textFields ?? {};
  if (
    Object.keys(after).length !== Object.keys(check.textFieldsBefore).length ||
    Object.entries(check.textFieldsBefore).some(
      ([name, value]) => after[name] !== value
    )
  ) {
    throw new CircularError(
      "The answers in the PDF were changed. Sign the copy you downloaded without editing it."
    );
  }
  // Filling a field and signing are the only changes a signature allows.
  if (
    report.signatures
      .slice(0, -1)
      .some((s) => s.modificationLevel === "OTHER") ||
    report.status === "invalid"
  ) {
    throw new CircularError(
      "The file was changed in a way the earlier signatures don't allow. Sign the copy you downloaded without editing it."
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
