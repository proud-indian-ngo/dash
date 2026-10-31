import { env } from "@pi-dash/env/server";
import z from "zod";

/**
 * Leegality's API for Aadhaar eSign (governance-resolutions.md, Aadhaar
 * eSign). A document goes out with every signer invited at once
 * (`POST /v2.1/sign/request`, the version that takes each signer's box), and
 * its state and current file come from `GET /v3.3/document/details`.
 * Leegality sends no invitations itself: each signer opens their link from
 * the dashboard.
 */

/** A refusal or fault from Leegality; `fault` ones go to Error Tracking. */
export class LeegalityError extends Error {
  readonly fault: boolean;
  constructor(message: string, options: { fault?: boolean } = {}) {
    super(message);
    this.fault = options.fault ?? false;
  }
}

const REQUEST_TIMEOUT_MS = 30_000;
/** The details API's file link lives 15 seconds. */
const FILE_TIMEOUT_MS = 10_000;

export function leegalityConfigured(): boolean {
  return !!(env.LEEGALITY_API_URL && env.LEEGALITY_AUTH_TOKEN);
}

const messages = z
  .array(z.object({ code: z.string().nullish(), message: z.string() }))
  .nullish();

const createResponse = z.object({
  data: z
    .object({
      documentId: z.string().min(1).optional(),
      invitations: z
        .array(z.object({ email: z.string().nullish() }))
        .optional(),
    })
    .nullish(),
  messages,
  status: z.number(),
});

const detailsResponse = z.object({
  data: z
    .object({
      auditTrail: z.string().nullish(),
      document: z.object({ status: z.string().nullish() }).nullish(),
      file: z.string().nullish(),
      invitations: z
        .array(
          z.object({
            email: z.string().nullish(),
            invitationStatus: z
              .object({
                active: z.boolean().nullish(),
                expired: z.boolean().nullish(),
                rejected: z.boolean().nullish(),
                signed: z.boolean().nullish(),
              })
              .nullish(),
            invitationUrl: z.string().nullish(),
          })
        )
        .nullish(),
    })
    .nullish(),
  messages,
  status: z.number(),
});

function failureText(body: { messages?: { message: string }[] | null }) {
  return (
    body.messages?.map((m) => m.message).join(" ") ||
    "Leegality refused the request."
  );
}

/**
 * A refusal: an empty eSign balance is for someone to top up, so it isn't
 * a fault; anything else is unexpected.
 */
function refusal(body: {
  messages?: { code?: string | null; message: string }[] | null;
}): LeegalityError {
  if (body.messages?.some((m) => m.code === "low.balance")) {
    return new LeegalityError(
      "Leegality's eSign balance is too low to send this. Top it up in Leegality's dashboard and try again."
    );
  }
  return new LeegalityError(failureText(body), { fault: true });
}

async function call(
  path: string,
  init: RequestInit,
  fetcher: typeof fetch
): Promise<unknown> {
  const { LEEGALITY_API_URL: apiUrl, LEEGALITY_AUTH_TOKEN: token } = env;
  if (!(apiUrl && token)) {
    throw new LeegalityError("Aadhaar eSign isn't set up here.", {
      fault: true,
    });
  }
  const response = await fetcher(`${apiUrl.replace(/\/$/, "")}/api${path}`, {
    ...init,
    // Only with a body: Leegality reads a JSON request's parameters from
    // the body, so a GET or DELETE that says JSON loses its query.
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      "X-Auth-Token": token,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => null);
  if (!response) {
    throw new LeegalityError("Leegality couldn't be reached. Try again.", {
      fault: true,
    });
  }
  if (!response.ok) {
    throw new LeegalityError(
      `Leegality answered ${String(response.status)}. Try again shortly.`,
      { fault: true }
    );
  }
  return await response.json();
}

export interface EsignInvitation {
  /** The signer's box, in PDF points from the bottom left. */
  box: [number, number, number, number];
  email: string;
  name: string;
  /** 1-based page of the box. */
  page: number;
}

/**
 * Sends `pdf` for Aadhaar eSign by every signer at once, each in their own
 * box, and returns Leegality's document ID. A response that invites other
 * people than asked (Leegality drops ones it can't take) is refused, and
 * the document deleted.
 */
export async function createEsignDocument(
  input: {
    expiryDays: number;
    /** Our reference, shown in Leegality's dashboard. */
    irn: string;
    name: string;
    pdf: Uint8Array;
    /** Invite them one after another, in this order. */
    sequential?: boolean;
    signers: EsignInvitation[];
  },
  fetcher: typeof fetch = fetch
): Promise<string> {
  const raw = await call(
    "/v2.1/sign/request",
    {
      body: JSON.stringify({
        expiryDays: input.expiryDays,
        file: {
          file: Buffer.from(input.pdf).toString("base64"),
          name: input.name,
        },
        invitees: input.signers.map((s) => ({
          appearances: [
            {
              page: String(s.page),
              x1: Math.round(s.box[0]),
              x2: Math.round(s.box[2]),
              y1: Math.round(s.box[1]),
              y2: Math.round(s.box[3]),
            },
          ],
          email: s.email,
          name: s.name,
          signatures: [{ config: { authTypes: ["OTP"] }, type: "AADHAAR" }],
        })),
        irn: input.irn,
        requestSignOrder: input.sequential ?? false,
      }),
      method: "POST",
    },
    fetcher
  );
  const parsed = createResponse.safeParse(raw);
  if (!parsed.success) {
    throw new LeegalityError("Leegality sent an answer we couldn't read.", {
      fault: true,
    });
  }
  const documentId = parsed.data.data?.documentId;
  if (parsed.data.status !== 1 || !documentId) {
    throw refusal(parsed.data);
  }
  const invited = (parsed.data.data?.invitations ?? [])
    .map((i) => i.email?.toLowerCase() ?? "")
    .sort();
  const asked = input.signers.map((s) => s.email.toLowerCase()).sort();
  if (JSON.stringify(invited) !== JSON.stringify(asked)) {
    await deleteEsignDocument(documentId, fetcher).catch(() => undefined);
    throw new LeegalityError(
      "Leegality didn't invite every trustee, so nothing was sent. Check the trustees' emails and issue again.",
      { fault: true }
    );
  }
  return documentId;
}

export interface EsignDocumentState {
  /** Leegality's audit trail, asked for and once everyone has signed; else null. */
  auditTrail: Uint8Array | null;
  /** Every invitee has signed. */
  completed: boolean;
  /** The PDF with every signature so far; null when not asked for. */
  file: Uint8Array | null;
  invitations: {
    email: string;
    expired: boolean;
    rejected: boolean;
    signed: boolean;
    url: string | null;
  }[];
}

/** A file from a details answer: its link lives 15 seconds. */
async function download(
  url: string,
  fetcher: typeof fetch
): Promise<Uint8Array> {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(FILE_TIMEOUT_MS),
  }).catch(() => null);
  if (!response?.ok) {
    throw new LeegalityError(
      "The document couldn't be downloaded from Leegality. Try again.",
      { fault: true }
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * The document's invitations and, with `file`, its current PDF; with
 * `auditTrail`, its audit trail once everyone has signed.
 */
export async function esignDocumentState(
  documentId: string,
  options: { auditTrail?: boolean; file: boolean },
  fetcher: typeof fetch = fetch
): Promise<EsignDocumentState> {
  const query = new URLSearchParams({ documentId });
  if (options.file) {
    query.set("file", "true");
  }
  if (options.auditTrail) {
    query.set("auditTrail", "true");
  }
  const raw = await call(
    `/v3.3/document/details?${query.toString()}`,
    { method: "GET" },
    fetcher
  );
  const parsed = detailsResponse.safeParse(raw);
  if (!parsed.success || parsed.data.status !== 1) {
    throw new LeegalityError(
      parsed.success
        ? failureText(parsed.data)
        : "Leegality sent an answer we couldn't read.",
      { fault: true }
    );
  }
  const data = parsed.data.data;
  let file: Uint8Array | null = null;
  if (options.file) {
    if (!data?.file) {
      throw new LeegalityError("Leegality didn't send the document's file.", {
        fault: true,
      });
    }
    file = await download(data.file, fetcher);
  }
  const completed = data?.document?.status === "COMPLETED";
  return {
    auditTrail:
      options.auditTrail && completed && data?.auditTrail
        ? await download(data.auditTrail, fetcher)
        : null,
    completed,
    file,
    invitations: (data?.invitations ?? []).map((i) => ({
      email: i.email?.toLowerCase() ?? "",
      expired: i.invitationStatus?.expired === true,
      rejected: i.invitationStatus?.rejected === true,
      signed: i.invitationStatus?.signed === true,
      url: i.invitationUrl ?? null,
    })),
  };
}

/** Deletes a document and revokes its unsigned invitations; one already gone counts as deleted. */
export async function deleteEsignDocument(
  documentId: string,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const raw = (await call(
    `/v3.0/sign/request?${new URLSearchParams({ documentId }).toString()}`,
    { method: "DELETE" },
    fetcher
  )) as {
    messages?: { code?: string | null; message: string }[];
    status?: number;
  };
  if (raw.messages?.some((m) => m.code === "no.document.found")) {
    return;
  }
  if (raw.status !== 1) {
    throw new LeegalityError(failureText(raw), { fault: true });
  }
}

/** Revokes one unsigned invitation, by its signing link. */
export async function deleteEsignInvitation(
  signUrl: string,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const raw = (await call(
    `/v3.0/sign/request/invitation?${new URLSearchParams({ signUrl }).toString()}`,
    { method: "DELETE" },
    fetcher
  )) as { messages?: { message: string }[]; status?: number };
  if (raw.status !== 1) {
    throw new LeegalityError(failureText(raw), { fault: true });
  }
}
