import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@pi-dash/env/server";
import z from "zod";

/**
 * Aadhaar eSign through Leegality (governance-resolutions.md, signing). A
 * trustee signs the circular's latest PDF in Leegality's journey; the
 * signed copy comes back through the same checks as an Acrobat upload.
 * API: `POST /v3.0/sign/request` to start, `GET /v3.3/document/details` for
 * the signed file, webhooks carrying an HMAC-SHA1 of the document ID.
 */

export class LeegalityError extends Error {}

/** The signed file's link from the details API lives this long. */
const FILE_LINK_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 20_000;

export interface LeegalityConfig {
  apiUrl: string;
  authToken: string;
  privateSalt: string;
  profileId: string;
}

export function leegalityConfig(): LeegalityConfig | null {
  const {
    LEEGALITY_API_URL: apiUrl,
    LEEGALITY_AUTH_TOKEN: authToken,
    LEEGALITY_PRIVATE_SALT: privateSalt,
    LEEGALITY_PROFILE_ID: profileId,
  } = env;
  return apiUrl && authToken && privateSalt && profileId
    ? { apiUrl: apiUrl.replace(/\/$/, ""), authToken, privateSalt, profileId }
    : null;
}

export function esignConfigured(): boolean {
  return leegalityConfig() !== null;
}

/** Leegality's MAC: HMAC-SHA1 of the document ID, keyed with the private salt, hex. */
export function leegalityMac(documentId: string, privateSalt: string): string {
  return createHmac("sha1", privateSalt).update(documentId).digest("hex");
}

export function verifyLeegalityMac(
  documentId: string,
  mac: string | null | undefined,
  privateSalt: string
): boolean {
  if (!mac) {
    return false;
  }
  const expected = Buffer.from(leegalityMac(documentId, privateSalt), "hex");
  const given = Buffer.from(mac.trim().toLowerCase(), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const messages = z
  .array(z.object({ code: z.string().optional(), message: z.string() }))
  .optional();

const createResponse = z.object({
  data: z
    .object({
      documentId: z.string().optional(),
      invitees: z
        .array(
          z.object({
            email: z.string().nullish(),
            signUrl: z.string().nullish(),
          })
        )
        .optional(),
    })
    .optional(),
  messages,
  status: z.number(),
});

const detailsResponse = z.object({
  data: z
    .object({
      document: z.object({ status: z.string().nullish() }).nullish(),
      file: z.string().nullish(),
      invitations: z
        .array(
          z.object({
            invitationStatus: z
              .object({
                expired: z.boolean().nullish(),
                rejected: z.boolean().nullish(),
                signed: z.boolean().nullish(),
              })
              .nullish(),
          })
        )
        .nullish(),
    })
    .nullish(),
  messages,
  status: z.number(),
});

function failureText(parsed: { messages?: { message: string }[] }): string {
  return (
    parsed.messages?.map((m) => m.message).join(" ") ||
    "Leegality refused the request."
  );
}

async function call(
  config: LeegalityConfig,
  path: string,
  init: RequestInit,
  fetcher: typeof fetch
): Promise<unknown> {
  const response = await fetcher(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": config.authToken,
      ...init.headers,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403) {
    throw new LeegalityError(
      "Leegality refused the dashboard's API token. Aadhaar eSign needs setting up again; tell the secretary."
    );
  }
  if (!response.ok) {
    throw new LeegalityError(
      `Leegality didn't answer (HTTP ${String(response.status)}). Try again shortly.`
    );
  }
  return await response.json();
}

export interface EsignSigner {
  /** Last four digits of the trustee's Aadhaar, checked against the certificate when known. */
  aadhaarLast4: string | null;
  email: string | null;
  name: string;
  phone: string | null;
}

/**
 * Sends one PDF to Leegality for one signer and returns the document ID and
 * the signer's link. The workflow (`profileId`) decides the signature type,
 * its placement and the webhook.
 */
export async function createEsignRequest(
  input: {
    fileName: string;
    /** Our reference, shown in Leegality's dashboard. */
    irn: string;
    pdf: Uint8Array;
    signer: EsignSigner;
  },
  config: LeegalityConfig,
  fetcher: typeof fetch = fetch
): Promise<{ documentId: string; signUrl: string }> {
  const invitee: Record<string, unknown> = { name: input.signer.name };
  if (input.signer.email) {
    invitee.email = input.signer.email;
  }
  if (input.signer.phone) {
    invitee.phone = input.signer.phone;
  }
  if (input.signer.aadhaarLast4) {
    invitee.aadhaarConfig = { verifyTitle: input.signer.aadhaarLast4 };
  }
  const raw = await call(
    config,
    "/v3.0/sign/request",
    {
      body: JSON.stringify({
        file: {
          file: Buffer.from(input.pdf).toString("base64"),
          name: input.fileName,
        },
        invitees: [invitee],
        irn: input.irn,
        profileId: config.profileId,
      }),
      method: "POST",
    },
    fetcher
  );
  const parsed = createResponse.safeParse(raw);
  if (!parsed.success) {
    throw new LeegalityError("Leegality sent an answer we couldn't read.");
  }
  const documentId = parsed.data.data?.documentId;
  const signUrl = parsed.data.data?.invitees?.find((i) => i.signUrl)?.signUrl;
  if (parsed.data.status !== 1 || !documentId || !signUrl) {
    throw new LeegalityError(failureText(parsed.data));
  }
  return { documentId, signUrl };
}

export type SignedFile =
  | { kind: "pending" }
  | { kind: "ended"; reason: "expired" | "rejected" }
  | { bytes: Uint8Array; kind: "signed" };

/**
 * The signed PDF once the signer has signed. The details API returns a link
 * that lives 15 seconds, so it's downloaded straight away.
 */
export async function fetchSignedFile(
  documentId: string,
  config: LeegalityConfig,
  fetcher: typeof fetch = fetch
): Promise<SignedFile> {
  const query = new URLSearchParams({ documentId, file: "true" });
  const raw = await call(
    config,
    `/v3.3/document/details?${query.toString()}`,
    { method: "GET" },
    fetcher
  );
  const parsed = detailsResponse.safeParse(raw);
  if (!parsed.success || parsed.data.status !== 1) {
    throw new LeegalityError(
      parsed.success
        ? failureText(parsed.data)
        : "Leegality sent an answer we couldn't read."
    );
  }
  const data = parsed.data.data;
  const status = data?.invitations?.[0]?.invitationStatus;
  if (status?.rejected) {
    return { kind: "ended", reason: "rejected" };
  }
  const completed =
    data?.document?.status === "COMPLETED" || status?.signed === true;
  if (!completed) {
    return status?.expired
      ? { kind: "ended", reason: "expired" }
      : { kind: "pending" };
  }
  if (!data?.file) {
    throw new LeegalityError("Leegality hasn't released the signed file yet.");
  }
  const file = await fetcher(data.file, {
    signal: AbortSignal.timeout(FILE_LINK_TIMEOUT_MS),
  });
  if (!file.ok) {
    throw new LeegalityError("The signed file couldn't be downloaded.");
  }
  return { bytes: new Uint8Array(await file.arrayBuffer()), kind: "signed" };
}

/** The fields of a Leegality webhook we act on. */
export const leegalityWebhook = z.object({
  documentId: z.string().min(1).max(100),
  documentStatus: z.string().nullish(),
  mac: z.string().nullish(),
  webhookType: z.string().nullish(),
});
