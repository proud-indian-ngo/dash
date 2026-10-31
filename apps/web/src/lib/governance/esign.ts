import { db } from "@pi-dash/db";
import {
  circularSigners,
  esignContacts,
  getEsignDocument,
  latestCircularPdf,
  setEsignDocumentClosed,
} from "@pi-dash/db/queries/esign";
import {
  fileGovernanceDocumentOnce,
  trusteeNamesForMatching,
} from "@pi-dash/db/queries/governance";
import {
  circularResolutions,
  type Decision,
  getCircular,
  ResolutionError,
  recordSignature,
  signerState,
} from "@pi-dash/db/queries/resolutions";
import { user } from "@pi-dash/db/schema/auth";
import { trustee } from "@pi-dash/db/schema/governance";
import type { EsignInvitee } from "@pi-dash/db/schema/private/esign";
import { DOCUMENT_TITLE_MAX } from "@pi-dash/shared/governance";
import { todayInKolkata } from "@pi-dash/shared/income";
import {
  answersText,
  circularReference,
  ESIGN_MAX_RESPONSE_DAYS,
  signatureFieldBox,
  signaturePageCount,
  signatureSlots,
} from "@pi-dash/shared/resolutions";
import { eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";

import { type AuditActor, runAuditedAction } from "../audit";
import { getS3 } from "../s3";
import { enqueueDecided, fileFinalCopy } from "./accept-signature";
import { CircularError, checkEsignedCopy, sha256Of } from "./circulars";
import {
  createEsignDocument,
  deleteEsignDocument,
  deleteEsignInvitation,
  esignDocumentState,
} from "./leegality";
import { circularKey } from "./signing-copy";
import {
  prepareForEsign,
  samePages,
  validateEsignPdf,
} from "./signing-service";

/**
 * Aadhaar eSign circulars (governance-resolutions.md, Aadhaar eSign). The
 * circular goes to Leegality once, with every trustee in office invited to
 * sign in their own box; Leegality's copy is the latest PDF on record, and
 * each signature on it is taken when someone checks or the scheduled check
 * runs, through the same recording as a DSC signature.
 */

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000
  );
}

function logFailure(
  event: string,
  fields: Record<string, string>,
  error: unknown
) {
  const log = createRequestLogger({ method: "POST", path: "governance/esign" });
  log.set({ event, ...fields });
  log.error(error instanceof Error ? error : String(error));
  log.emit();
}

/**
 * Sends a rendered document to Leegality for Aadhaar eSign by `signerIds`,
 * each in their own box on the signature page (the slots the PDF draws),
 * at once or, with `sequential`, in that order. Leegality's copy must show
 * the same pages as the one sent; a failure deletes the document again.
 * Returns the copy sent, Leegality's copy (the base signatures extend) and
 * what to record about the document.
 */
export async function sendForEsign(input: {
  expiryDays: number;
  /** Our reference, shown in Leegality's dashboard. */
  irn: string;
  name: string;
  rendered: Uint8Array;
  sequential?: boolean;
  signerIds: readonly string[];
}) {
  const ids = input.signerIds;
  const contacts = await esignContacts(ids);
  const emails = new Map<string, string>();
  for (const id of ids) {
    const row = contacts.find((c) => c.id === id);
    const email = (row?.contactEmail || row?.accountEmail || "").toLowerCase();
    if (!(row && email)) {
      throw new CircularError(
        `Aadhaar eSign needs an email for every signer; ${row?.legalName ?? "a trustee"} has none. Add it to their record or link their account.`
      );
    }
    if ([...emails.values()].includes(email)) {
      throw new CircularError(
        `Two trustees share the email ${email}, so Leegality can't tell their invitations apart.`
      );
    }
    emails.set(id, email);
  }
  const prepared = await prepareForEsign(input.rendered);
  const pages = signaturePageCount(ids.length);
  const invitees: EsignInvitee[] = signatureSlots(ids).map((slot) => ({
    box: signatureFieldBox(slot),
    email: emails.get(slot.trusteeId) ?? "",
    page: prepared.pageCount - pages + slot.pageOffset,
    trusteeId: slot.trusteeId,
  }));
  const documentId = await createEsignDocument({
    expiryDays: input.expiryDays,
    irn: input.irn,
    name: input.name,
    pdf: prepared.pdf,
    sequential: input.sequential ?? false,
    signers: invitees.map((invitee) => {
      const row = contacts.find((c) => c.id === invitee.trusteeId);
      return {
        box: invitee.box,
        email: invitee.email,
        name: row?.aadhaarName || row?.legalName || "",
        page: invitee.page + 1,
      };
    }),
  });
  try {
    const { file } = await esignDocumentState(documentId, { file: true });
    if (!(file && (await samePages(prepared.pdf, file)))) {
      throw new CircularError(
        "Leegality's copy doesn't show the same pages, so it wasn't sent. Try again.",
        { fault: true }
      );
    }
    return { base: file, documentId, invitees, prepared: prepared.pdf };
  } catch (error) {
    await discardEsignDocument(documentId);
    throw error;
  }
}

/**
 * Sends a rendered circular to Leegality and stores the copy sent and
 * Leegality's copy of it. Returns what `issueCircular` records. Once
 * Leegality has the document, a failure deletes it again; so does the
 * caller if issuing then fails (`discardEsignDocument`).
 */
export async function sendCircularForEsign(input: {
  circularId: string;
  rendered: Uint8Array;
  responseDueOn: string;
  signers: readonly { trusteeId: string }[];
  today: string;
}) {
  // Invitations expire at the end of the day this many days on, in India
  // time, so they last through the response date.
  const expiryDays = daysBetween(input.today, input.responseDueOn);
  if (expiryDays > ESIGN_MAX_RESPONSE_DAYS) {
    throw new CircularError(
      `Leegality keeps an eSign invitation for at most ${ESIGN_MAX_RESPONSE_DAYS} days, so responses can be due at most ${ESIGN_MAX_RESPONSE_DAYS} days after issue.`
    );
  }
  const reference = circularReference(input.circularId);
  const sent = await sendForEsign({
    expiryDays,
    irn: reference,
    name: `Circular ${reference}`,
    rendered: input.rendered,
    signerIds: input.signers.map((s) => s.trusteeId),
  });
  try {
    const s3 = await getS3();
    const issued = {
      objectKey: circularKey(input.circularId, "issued.pdf"),
      sha256: sha256Of(sent.prepared),
    };
    const latest = {
      objectKey: circularKey(input.circularId, "leegality.pdf"),
      sha256: sha256Of(sent.base),
    };
    await s3.write(issued.objectKey, sent.prepared, {
      type: "application/pdf",
    });
    await s3.write(latest.objectKey, sent.base, { type: "application/pdf" });
    return {
      esign: { documentId: sent.documentId, invitees: sent.invitees, latest },
      pdf: issued,
    };
  } catch (error) {
    await discardEsignDocument(sent.documentId);
    throw error;
  }
}

/** The DSC copy, upload and helper are for DSC circulars only. */
export async function assertDscCircular(circularId: string): Promise<void> {
  const row = await getCircular(circularId);
  if (row?.signingMode === "esign") {
    throw new CircularError(
      "This circular is signed with Aadhaar eSign, on Leegality only."
    );
  }
}

/**
 * Deletes a document's Leegality document without filing its audit trail
 * (its target was made again, dropped, discarded or cancelled), then marks
 * it closed. A failure throws, leaving it open.
 */
export async function withdrawEsign(doc: EsignRow): Promise<void> {
  await deleteEsignDocument(doc.documentId);
  await setEsignDocumentClosed(doc.id);
}

/** `withdrawEsign`, a failure logged and left open for the scheduled check to retry. */
export async function dropEsignDocument(doc: EsignRow | null): Promise<void> {
  if (!doc || doc.closedAt) {
    return;
  }
  await withdrawEsign(doc).catch((error: unknown) =>
    logFailure("esign_withdraw_failed", { documentId: doc.documentId }, error)
  );
}

/**
 * Before sending minutes or a certificate for eSign: each signer opens
 * their Leegality link from the dashboard, so each needs an account.
 */
export async function assertSignersHaveAccounts(
  trusteeIds: readonly string[]
): Promise<void> {
  const contacts = await esignContacts(trusteeIds);
  const missing = contacts.find((c) => !c.accountEmail);
  if (missing) {
    throw new CircularError(
      `${missing.legalName} has no dashboard account, so they couldn't open their Leegality link. Link their account or sign with DSC.`
    );
  }
}

/** Deletes a Leegality document that nothing was recorded against. */
export async function discardEsignDocument(documentId: string): Promise<void> {
  await deleteEsignDocument(documentId).catch((error: unknown) =>
    logFailure("esign_discard_failed", { documentId }, error)
  );
}

type EsignRow = NonNullable<Awaited<ReturnType<typeof getEsignDocument>>>;

/** The trustee's invitation on a Leegality document. */
async function invitationIn(doc: EsignRow | null, trusteeId: string) {
  const invitee = doc?.invitees.find((i) => i.trusteeId === trusteeId);
  if (!(doc && invitee) || doc.closedAt) {
    return null;
  }
  const { invitations } = await esignDocumentState(doc.documentId, {
    file: false,
  });
  return invitations.find((i) => i.email === invitee.email) ?? null;
}

/** The trustee's invitation on the circular's Leegality document. */
async function invitationOf(circularId: string, trusteeId: string) {
  return await invitationIn(await getEsignDocument(circularId), trusteeId);
}

/**
 * The signer's Leegality link on a document, fetched when they open it,
 * never stored; refused once they've signed, declined or let it lapse.
 * `remedy` is what to do about a closed invitation ("Declare again."), and
 * `owner` who looks into a missing link.
 */
export async function signingLinkIn(
  doc: EsignRow | null,
  trusteeId: string,
  help: { owner: string; remedy: string } = {
    owner: "a governance manager",
    remedy: "",
  }
): Promise<string> {
  const invitation = await invitationIn(doc, trusteeId);
  const then = help.remedy ? ` ${help.remedy}` : "";
  if (invitation?.signed) {
    throw new CircularError(
      "You've signed it on Leegality. Press “I've signed” to record your signature."
    );
  }
  if (invitation?.rejected) {
    throw new CircularError(
      `You declined to sign it on Leegality, so the invitation is closed.${then}`
    );
  }
  if (invitation?.expired) {
    throw new CircularError(`Your Leegality invitation has expired.${then}`);
  }
  if (!invitation?.url) {
    throw new CircularError(
      `Leegality has no signing link for you. Ask ${help.owner} to look into it.`,
      { fault: true }
    );
  }
  return invitation.url;
}

/**
 * The trustee's Leegality signing link, fetched when they open it, never
 * stored.
 */
export async function esignSigningLink(
  circularId: string,
  trusteeId: string
): Promise<string> {
  const state = await signerState(db, circularId, trusteeId);
  if (!state) {
    throw new CircularError(
      "You weren't a trustee in office when this was issued."
    );
  }
  if (state.openAssents === 0) {
    throw new CircularError(
      "There's nothing left for you to sign on this circular."
    );
  }
  return await signingLinkIn(await getEsignDocument(circularId), trusteeId);
}

/** Each invited trustee's state on Leegality, for the circular's page. */
export async function esignInvitationStates(circularId: string) {
  const doc = await getEsignDocument(circularId);
  if (!doc || doc.closedAt) {
    return [];
  }
  const { invitations } = await esignDocumentState(doc.documentId, {
    file: false,
  });
  return doc.invitees.map((invitee) => {
    const invitation = invitations.find((i) => i.email === invitee.email);
    return {
      state: invitation?.signed
        ? ("signed" as const)
        : invitation?.rejected
          ? ("declined" as const)
          : invitation?.expired
            ? ("expired" as const)
            : ("pending" as const),
      trusteeId: invitee.trusteeId,
    };
  });
}

/** The trustee's account, to audit their eSign in their name; none without one. */
export async function signerActor(
  trusteeId: string
): Promise<AuditActor | null> {
  const [row] = await db
    .select({ name: user.name, role: user.role, userId: user.id })
    .from(trustee)
    .innerJoin(user, eq(user.id, trustee.userId))
    .where(eq(trustee.id, trusteeId))
    .limit(1);
  return row
    ? { name: row.name, role: row.role ?? "unknown", userId: row.userId }
    : null;
}

/**
 * The eSigns added on Leegality since `current`, the copy on record that
 * `signedTrusteeIds` have signed so far, checked (`checkEsignedCopy`), in
 * signing order; null when there are none.
 */
export async function takeNewEsigns(
  doc: EsignRow,
  current: Uint8Array,
  signedTrusteeIds: readonly string[]
) {
  const state = await esignDocumentState(doc.documentId, { file: false });
  // Nothing new: spare the download.
  if (
    state.invitations.filter((i) => i.signed).length <= signedTrusteeIds.length
  ) {
    return null;
  }
  const { file } = await esignDocumentState(doc.documentId, { file: true });
  if (!file || file.byteLength <= current.byteLength) {
    return null;
  }
  const [trustees, report] = await Promise.all([
    trusteeNamesForMatching(),
    validateEsignPdf(file, current.byteLength),
  ]);
  const added = checkEsignedCopy({
    current,
    report,
    signed: file,
    signedBefore: signedTrusteeIds.length,
    trustees,
    unsigned: doc.invitees.filter(
      (i) => !signedTrusteeIds.includes(i.trusteeId)
    ),
  });
  return { added, file, report };
}

/**
 * Takes every signature added on Leegality since the latest PDF on record:
 * checks Leegality's copy (`checkEsignedCopy`), then records each in
 * signing order on the copy as that signature left it, as of the day its
 * timestamp says it was made, and audited in the signer's name. A
 * signature made after the response date ends the run. Resolutions it
 * passes get their evidence filed as for a DSC signature; once the circular
 * is decided its Leegality document is closed. Signatures another check
 * already recorded are skipped. Returns the trustees whose signatures were
 * recorded, with the decisions they caused.
 */
export async function collectEsignatures(
  circularId: string
): Promise<{ decisions: Decision[]; trusteeId: string }[]> {
  const [doc, latest, row] = await Promise.all([
    getEsignDocument(circularId),
    latestCircularPdf(circularId),
    getCircular(circularId),
  ]);
  if (!(doc && latest && row)) {
    throw new CircularError("This circular isn't signed with Aadhaar eSign.");
  }
  if (doc.closedAt) {
    return [];
  }
  const s3 = await getS3();
  const current = new Uint8Array(await s3.file(latest.objectKey).arrayBuffer());
  if (sha256Of(current) !== latest.sha256) {
    throw new CircularError(
      "The circular's latest copy doesn't match its record. Ask the Managing Trustee to look into it.",
      { fault: true }
    );
  }
  const signers = await circularSigners(circularId);
  const taken = await takeNewEsigns(doc, current, signers);
  if (!taken) {
    return [];
  }
  const { added, file } = taken;
  const recorded: { decisions: Decision[]; trusteeId: string }[] = [];
  let basedOnSha256 = latest.sha256;
  for (const [index, item] of added.entries()) {
    const signedOn = todayInKolkata(new Date(item.signedAt));
    if (signedOn > row.responseDueOn) {
      break;
    }
    const bytes = file.slice(0, item.end);
    const sha256 = sha256Of(bytes);
    // Keyed by content, like an uploaded copy.
    const objectKey = circularKey(
      circularId,
      `signed-${String(signers.length + index + 1)}-${sha256.slice(0, 16)}.pdf`
    );
    await s3.write(objectKey, bytes, { type: "application/pdf" });
    const answers = answersText(
      (await signerState(db, circularId, item.trusteeId))?.answers ?? []
    );
    const record = () =>
      recordSignature({
        answers,
        basedOnSha256,
        circularId,
        createdBy: null,
        method: "esign",
        objectKey,
        sha256,
        signature: { ...item.signature, matchedTrusteeId: item.trusteeId },
        today: signedOn,
        trusteeId: item.trusteeId,
      });
    const actor = await signerActor(item.trusteeId);
    let decisions: Decision[];
    try {
      decisions = actor
        ? await runAuditedAction(
            {
              action: "circular.sign",
              actor,
              metadata: { method: "esign" },
              target: { id: circularId, type: "circular" },
            },
            record
          )
        : await record();
    } catch (error) {
      // Another check recorded it first.
      const now = await latestCircularPdf(circularId);
      if (error instanceof ResolutionError && now?.sha256 !== basedOnSha256) {
        break;
      }
      throw error;
    }
    basedOnSha256 = sha256;
    recorded.push({ decisions, trusteeId: item.trusteeId });
    enqueueDecided(decisions);
    const passed = decisions
      .filter((d) => d.status === "passed")
      .map((d) => d.resolutionId);
    if (passed.length > 0) {
      await fileFinalCopy(circularId, passed, {
        bytes,
        esign: true,
        objectKey,
        // The report for this copy itself, not the later one.
        report: await validateEsignPdf(bytes),
      });
    }
    if (decisions.every((d) => d.status !== "issued")) {
      await closeEsignDocument(circularId);
      break;
    }
  }
  return recorded;
}

/**
 * Before a trustee objects or declares a conflict on an eSign circular:
 * once they have signed on Leegality, their eSign assents to the open
 * resolutions, so it is taken and the answer refused.
 */
export async function assertNotEsigned(
  circularId: string,
  trusteeId: string
): Promise<void> {
  const invitation = await invitationOf(circularId, trusteeId);
  if (!invitation?.signed) {
    return;
  }
  await collectEsignatures(circularId).catch((error: unknown) =>
    logFailure("esign_collect_failed", { circularId }, error)
  );
  throw new CircularError(
    "You've signed this circular on Leegality, so your eSign assents to its open resolutions. It can't be changed now."
  );
}

/**
 * After a trustee objects or declares a conflict on an eSign circular: one
 * left with nothing to assent to can't sign, so their invitation is
 * revoked; a decided circular's document is closed.
 */
export async function afterEsignResponse(
  circularId: string,
  trusteeId: string
): Promise<void> {
  const doc = await getEsignDocument(circularId);
  if (!doc || doc.closedAt) {
    return;
  }
  const resolutions = await circularResolutions(circularId);
  if (resolutions.every((r) => r.status !== "issued")) {
    await closeEsignDocument(circularId);
    return;
  }
  const state = await signerState(db, circularId, trusteeId);
  if (state?.openAssents !== 0) {
    return;
  }
  const invitation = await invitationOf(circularId, trusteeId);
  if (invitation?.url && !invitation.signed) {
    await deleteEsignInvitation(invitation.url).catch((error: unknown) =>
      logFailure("esign_invitation_delete_failed", { circularId }, error)
    );
  }
}

/**
 * A Leegality document that is done with (signed, decided or withdrawn):
 * Leegality's audit trail (once every signer has signed) goes
 * into the vault, then the document is deleted, revoking any unsigned
 * invitations. A failure is logged and left for the scheduled check to
 * retry.
 */
export async function closeEsign(
  doc: EsignRow | null,
  /** "circular C-…", "the minutes of …": what the audit trail is of. */
  what: string,
  /** Where the audit trail is stored, from its file name. */
  keyFor: (name: string) => string
): Promise<void> {
  if (!doc || doc.closedAt) {
    return;
  }
  try {
    const { auditTrail } = await esignDocumentState(doc.documentId, {
      auditTrail: true,
      file: false,
    });
    if (auditTrail) {
      const sha256 = sha256Of(auditTrail);
      const objectKey = keyFor(
        `leegality-audit-trail-${sha256.slice(0, 16)}.pdf`
      );
      const s3 = await getS3();
      await s3.write(objectKey, auditTrail, { type: "application/pdf" });
      await fileGovernanceDocumentOnce({
        contentType: "application/pdf",
        datedOn: todayInKolkata(),
        kind: "evidence",
        note: `Leegality's audit trail of the Aadhaar eSigns on ${what}.`,
        objectKey,
        originalFilename: "leegality-audit-trail.pdf",
        sha256,
        sizeBytes: auditTrail.byteLength,
        sourceFormat: "pdf",
        title: `Aadhaar eSign audit trail: ${what}`.slice(
          0,
          DOCUMENT_TITLE_MAX
        ),
        uploadedBy: null,
        validationReport: null,
      });
    }
    await deleteEsignDocument(doc.documentId);
    await setEsignDocumentClosed(doc.id);
  } catch (error) {
    logFailure("esign_close_failed", { documentId: doc.documentId }, error);
  }
}

/** Closes a decided or withdrawn eSign circular's Leegality document. */
export async function closeEsignDocument(circularId: string): Promise<void> {
  await closeEsign(
    await getEsignDocument(circularId),
    `circular ${circularReference(circularId)}`,
    (name) => circularKey(circularId, name)
  );
}
