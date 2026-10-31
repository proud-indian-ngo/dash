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
import { parseRichText, richTextHasText } from "@pi-dash/shared/rich-text";

import { assertOwnedTemporaryUploadKey } from "../temporary-upload";

/**
 * Circular resolutions on the server: issuing (checks, PDF, signature
 * fields, storage), and taking a trustee's Acrobat-signed PDF. The database
 * work is in packages/db/src/queries/resolutions.ts; this module wires it to
 * R2, the PDF renderer and the signing service through injected deps so the
 * rules are testable.
 */

export class CircularError extends Error {
  /** The signing service couldn't check the signature: reported to Error Tracking with its message. */
  readonly fault: boolean;
  constructor(message: string, options: { fault?: boolean } = {}) {
    super(message);
    this.fault = options.fault ?? false;
  }
}

/** What signing a prepared or new signature field may change (pyHanko's levels). */
const SIGNING_CHANGE_LEVELS = new Set(["NONE", "LTA_UPDATES", "FORM_FILLING"]);

export const UNTRUSTED_CERTIFICATE_MESSAGE =
  "This certificate doesn't chain to a licensed Indian certifying authority. Sign with your DSC.";

export const EARLIER_SIGNATURE_UNTRUSTED_MESSAGE =
  "An earlier trustee's signature on this document no longer validates: its certificate may have been revoked. Yours can't be added until that's sorted out, so tell the Managing Trustee.";

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
 * Whether a plan made again, from the register as it is now, still renders
 * the circular already prepared. A refusal now means the board changed.
 */
export function planStillHolds(
  prepared: IssuePlan,
  replan: () => IssuePlan
): boolean {
  try {
    return JSON.stringify(replan()) === JSON.stringify(prepared);
  } catch (error) {
    if (error instanceof CircularError) {
      return false;
    }
    throw error;
  }
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
    if (!richTextHasText(parseRichText(draft.body))) {
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

const FIELDS_UNCHECKED_MESSAGE =
  "Which box your signature is in couldn't be checked. Try again.";

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
 * update) that changes no more than signing a field does, the new signature
 * must be intact, cover the whole file, chain to a licensed Indian CA, sit in
 * the trustee's own field, which the PDF already had, lock none but the
 * trustee's own fields, certify nothing, and be theirs by
 * name; every earlier signature must still be intact and trusted, and every
 * answers field as it was. `report` must be checked against `current` (its
 * byte length as the base). Returns the new signature.
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
        "This isn't the latest copy of the document with your signature added. Download it again, sign it and upload the saved file without other changes."
      );
    }
  }
  if (report.status === "unavailable") {
    throw new CircularError(
      report.message ?? "The signature couldn't be checked right now.",
      { fault: true }
    );
  }
  if (report.signatures.length !== check.signedBefore + 1) {
    throw new CircularError("Add exactly one signature: yours, in your box.");
  }
  const added = report.signatures.at(-1);
  if (!added) {
    throw new CircularError("No signature was found in the file.");
  }
  // Every copy is issued with a box per trustee, and only its trustee signs it.
  const baseFields = report.baseSignatureFields;
  if (!baseFields) {
    throw new CircularError(FIELDS_UNCHECKED_MESSAGE);
  }
  if (!baseFields.includes(added.fieldName)) {
    throw new CircularError(
      "Sign in your own box, under your name, rather than adding a new one."
    );
  }
  if (added.fieldName !== check.fieldName) {
    throw new CircularError("Sign in the box with your own name.");
  }
  if (added.error) {
    throw new CircularError(
      `Your signature couldn't be checked (${added.error}). Try again in a few minutes.`
    );
  }
  if (!(added.intact && added.coversWholeRevision)) {
    throw new CircularError(
      "Your signature doesn't check out: the file changed after it was signed."
    );
  }
  if (!added.trusted) {
    throw new CircularError(UNTRUSTED_CERTIFICATE_MESSAGE);
  }
  const earlier = report.signatures.slice(0, -1);
  if (earlier.some((s) => !s.intact)) {
    throw new CircularError("An earlier signature no longer checks out.");
  }
  // Each earlier signature counts towards the resolutions this one may pass.
  if (earlier.some((s) => !s.trusted)) {
    throw new CircularError(EARLIER_SIGNATURE_UNTRUSTED_MESSAGE);
  }
  checkLeavesRoomForOthers(added, [
    answersFieldName(check.trustee.id),
    check.fieldName,
  ]);
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
  // pyHanko judges only changes after a signature, so the revision the new
  // one signs is judged against the copy the trustee was given.
  if (!SIGNING_CHANGE_LEVELS.has(report.changesSinceBase ?? "")) {
    throw new CircularError(
      "The file was changed beyond adding your signature. Sign the copy you downloaded without editing it."
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

/**
 * A certification signature, or a lock (FieldMDP) on anything but the
 * trustee's own fields, would make the later trustees' signatures fail.
 */
function checkLeavesRoomForOthers(
  added: GovernanceValidationReport["signatures"][number],
  ownFields: readonly string[]
): void {
  if (added.certifies !== false) {
    throw new CircularError(
      "Your signature certifies the document, which limits the signatures after it. Sign it as an ordinary (approval) signature."
    );
  }
  if (
    !added.locks ||
    added.locks.some(
      (lock) =>
        lock.action !== "include" ||
        lock.fields.some((field) => !ownFields.includes(field))
    )
  ) {
    throw new CircularError(
      "Your signature locks parts of the document the other trustees still need, so their signatures would fail. Sign without locking the document."
    );
  }
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

// ── Aadhaar eSign ───────────────────────────────────────────────────────────

/** How far Leegality may draw a signature from the box it was given, in points. */
const ESIGN_BOX_TOLERANCE = 2;

export interface EsignSigner {
  /** The trustee's box, in PDF points from the bottom left. */
  box: readonly [number, number, number, number];
  /** 0-based page of the box. */
  page: number;
  trusteeId: string;
}

export interface EsignedSignature {
  /** The file's length as this signature left it. */
  end: number;
  signature: GovernanceValidationReport["signatures"][number];
  /** When its timestamp token says it was made (ISO). */
  signedAt: string;
  trusteeId: string;
}

function inside(
  rect: readonly number[],
  box: readonly [number, number, number, number]
): boolean {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = rect;
  return (
    x1 >= box[0] - ESIGN_BOX_TOLERANCE &&
    y1 >= box[1] - ESIGN_BOX_TOLERANCE &&
    x2 <= box[2] + ESIGN_BOX_TOLERANCE &&
    y2 <= box[3] + ESIGN_BOX_TOLERANCE
  );
}

/**
 * Checks Leegality's copy of an Aadhaar eSign circular against the latest
 * one on record (`current`): it must extend it, change nothing but add
 * signatures in fields Leegality adds, and each new signature must be
 * intact, cover its revision, chain to a licensed Indian CA, certify and
 * lock nothing, carry a timestamp (its certificate lives about half an
 * hour, so the timestamp is what keeps it trusted), and sit in the box of a
 * trustee who hasn't signed yet, the one trustee in whose name it is.
 * Every earlier signature must still be intact and trusted. `report` is
 * the copy's check with `current`'s length as the base; `trustees` are
 * every trustee's names. Returns the new signatures in signing order.
 */
export function checkEsignedCopy(input: {
  current: Uint8Array;
  report: GovernanceValidationReport;
  signed: Uint8Array;
  signedBefore: number;
  trustees: readonly { id: string; names: string[] }[];
  unsigned: readonly EsignSigner[];
}): EsignedSignature[] {
  const { current, report, signed } = input;
  const fault = (message: string) =>
    new CircularError(message, { fault: true });
  if (signed.byteLength <= current.byteLength) {
    return [];
  }
  for (let i = 0; i < current.byteLength; i++) {
    if (signed[i] !== current[i]) {
      throw fault(
        "Leegality's copy no longer extends the copy on record, so its signatures can't be taken."
      );
    }
  }
  if (report.status === "unavailable") {
    throw fault(
      report.message ?? "The signatures couldn't be checked right now."
    );
  }
  if (!SIGNING_CHANGE_LEVELS.has(report.changesSinceBase ?? "")) {
    throw fault(
      "Leegality's copy changed more than adding signatures, so its signatures can't be taken."
    );
  }
  if (report.signatures.some((s) => s.modificationLevel === "OTHER")) {
    throw fault(
      "Leegality's copy was changed in a way its signatures don't allow, so its signatures can't be taken."
    );
  }
  const earlier = report.signatures.slice(0, input.signedBefore);
  if (earlier.length !== input.signedBefore) {
    throw fault("A signature on record is missing from Leegality's copy.");
  }
  if (earlier.some((s) => !(s.intact && s.trusted))) {
    throw new CircularError(EARLIER_SIGNATURE_UNTRUSTED_MESSAGE);
  }
  const taken = new Set<string>();
  let previousEnd = current.byteLength;
  const added = report.signatures.slice(input.signedBefore).map((signature) => {
    if (signature.error) {
      throw fault(
        `A new signature couldn't be checked (${signature.error}). Try again in a few minutes.`
      );
    }
    if (!(signature.intact && signature.coversWholeRevision)) {
      throw fault(
        "A new signature doesn't check out: the file changed after it."
      );
    }
    if (!signature.trusted) {
      throw fault(
        "A new signature's certificate doesn't chain to a licensed Indian certifying authority."
      );
    }
    if (signature.certifies !== false || (signature.locks?.length ?? 1) > 0) {
      throw fault("A new signature limits the signatures after it.");
    }
    // Trusted as of this time: a timestamp's, or the signer's own (CDSL
    // Ventures' eSigns carry no timestamp; their certificate lives about 30
    // minutes, which bounds it).
    if (!signature.signedAt) {
      throw fault(
        "A new signature says neither when it was made nor carries a timestamp, so it can't be trusted once its certificate expires."
      );
    }
    const signer = input.unsigned.find(
      (s) =>
        !taken.has(s.trusteeId) &&
        signature.page === s.page &&
        signature.rect &&
        inside(signature.rect, s.box)
    );
    if (!signer) {
      throw fault(
        "A new signature isn't in a box of a trustee who hasn't signed."
      );
    }
    if (
      matchSignerToTrustee(signature.signerName, input.trustees) !==
      signer.trusteeId
    ) {
      throw new CircularError(
        `The eSign in a trustee's box is in the name of ${signature.signerName ?? "someone else"}, which doesn't match the trustee's name in the register. Ask the Managing Trustee to check the trustee's Aadhaar name.`
      );
    }
    const end = signature.end ?? 0;
    if (end <= previousEnd || end > signed.byteLength) {
      throw fault("The new signatures aren't in order in Leegality's copy.");
    }
    previousEnd = end;
    taken.add(signer.trusteeId);
    return {
      end,
      signature,
      signedAt: signature.signedAt,
      trusteeId: signer.trusteeId,
    };
  });
  if (previousEnd !== signed.byteLength) {
    throw fault("Leegality's copy has changes after its last signature.");
  }
  return added;
}
