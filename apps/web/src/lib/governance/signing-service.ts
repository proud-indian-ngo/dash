import type { GovernanceValidationReport } from "@pi-dash/db/schema/governance";
import { env } from "@pi-dash/env/server";

const TIMEOUT_MS = 30_000;

function unavailable(message: string): GovernanceValidationReport {
  return {
    checkedAt: new Date().toISOString(),
    message,
    signatures: [],
    status: "unavailable",
  };
}

/** Whether the signing service is configured in this environment. */
export function signingServiceConfigured(): boolean {
  return !!(env.SIGNING_SERVICE_URL && env.SIGNING_SERVICE_TOKEN);
}

/**
 * Asks the internal signing service (services/signing-plugin) to check every
 * signature in a PDF. Never throws: when the service is missing or fails,
 * the report says "unavailable" and the document is stored unchecked, to be
 * checked again later. With `baseLength`, the report also says how much the
 * revisions appended to that many leading bytes change (`changesSinceBase`).
 */
export async function validateSignedPdf(
  bytes: Uint8Array,
  baseLength?: number,
  fetchImpl: typeof fetch = fetch
): Promise<GovernanceValidationReport> {
  if (!(env.SIGNING_SERVICE_URL && env.SIGNING_SERVICE_TOKEN)) {
    return unavailable("The signing service isn't configured");
  }
  const url = new URL("/validate", env.SIGNING_SERVICE_URL);
  if (baseLength !== undefined) {
    url.searchParams.set("base", String(baseLength));
  }
  try {
    const response = await fetchImpl(url, {
      body: new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
      headers: {
        Authorization: `Bearer ${env.SIGNING_SERVICE_TOKEN}`,
        "Content-Type": "application/pdf",
      },
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return unavailable(`The signing service answered ${response.status}`);
    }
    return (await response.json()) as GovernanceValidationReport;
  } catch {
    return unavailable("The signing service couldn't be reached");
  }
}

/**
 * The signing service refused or failed. A refusal it explains is the
 * person's to fix; a fault (not set up, unreachable, a 5xx or a rejected
 * token) is reported to Error Tracking with the same message.
 */
export class SigningServiceError extends Error {
  readonly fault: boolean;
  constructor(message: string, options: { fault: boolean }) {
    super(message);
    this.fault = options.fault;
  }
}

/**
 * Adds per signer an empty signature field, and on a circular, minutes or
 * declaration the read-only answers field it locks. Throws when the service is
 * missing or refuses: every signer signs in a field the document was made with.
 */
export async function prepareSignatureFields(
  pdf: Uint8Array,
  fields: {
    /** The trustee's answers field, which their signature locks; both or neither. */
    answersBox?: [number, number, number, number];
    answersName?: string;
    box: [number, number, number, number];
    name: string;
    page: number;
  }[],
  fetchImpl: typeof fetch = fetch
): Promise<Uint8Array> {
  if (!(env.SIGNING_SERVICE_URL && env.SIGNING_SERVICE_TOKEN)) {
    throw new SigningServiceError(
      "Making this document needs the signing service, which isn't set up here.",
      { fault: true }
    );
  }
  const response = await fetchImpl(
    new URL("/pidash/prepare", env.SIGNING_SERVICE_URL),
    {
      body: JSON.stringify({
        fields,
        pdf: Buffer.from(pdf).toString("base64"),
      }),
      headers: {
        Authorization: `Bearer ${env.SIGNING_SERVICE_TOKEN}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  ).catch(() => null);
  if (!response?.ok) {
    throw new SigningServiceError(
      "The signing service couldn't prepare the signature boxes. Try again.",
      { fault: true }
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function post(
  path: string,
  body: BodyInit,
  contentType: string,
  fetchImpl: typeof fetch
): Promise<Response> {
  if (!(env.SIGNING_SERVICE_URL && env.SIGNING_SERVICE_TOKEN)) {
    throw new SigningServiceError(
      "Signing needs the signing service, which isn't set up here.",
      { fault: true }
    );
  }
  const response = await fetchImpl(new URL(path, env.SIGNING_SERVICE_URL), {
    body,
    headers: {
      Authorization: `Bearer ${env.SIGNING_SERVICE_TOKEN}`,
      "Content-Type": contentType,
    },
    method: "POST",
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!response) {
    throw new SigningServiceError("The signing service couldn't be reached.", {
      fault: true,
    });
  }
  if (!response.ok) {
    const detail = await response
      .json()
      .then((b: { detail?: unknown }) =>
        typeof b.detail === "string" ? b.detail : null
      )
      .catch(() => null);
    // A 4xx the service explains refuses this document or signature; a 5xx
    // or a rejected token is the service's or this server's fault.
    const refused =
      detail !== null &&
      response.status < 500 &&
      response.status !== 401 &&
      response.status !== 403;
    throw new SigningServiceError(
      detail ?? `The signing service answered ${response.status}.`,
      { fault: !refused }
    );
  }
  return response;
}

/** Fills a trustee's answers field: the copy they then sign. */
export async function fillAnswers(
  input: { name: string; pdf: Uint8Array; value: string },
  fetchImpl: typeof fetch = fetch
): Promise<Uint8Array> {
  const response = await post(
    "/fill",
    JSON.stringify({
      name: input.name,
      pdf: Buffer.from(input.pdf).toString("base64"),
      value: input.value,
    }),
    "application/json",
    fetchImpl
  );
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Revocation data and a document timestamp: the long-term copy (PAdES
 * B-LTA). An Aadhaar eSign copy (`esign`) goes through the plugin, which
 * reads Leegality's files and collects each signature's data as of when it
 * was made, its certificate having expired since.
 */
export async function finalizeForArchive(
  pdf: Uint8Array,
  options: { esign?: boolean } = {},
  fetchImpl: typeof fetch = fetch
): Promise<Uint8Array> {
  const response = await post(
    options.esign ? "/pidash/finalize-esign" : "/finalize",
    new Blob([new Uint8Array(pdf)], { type: "application/pdf" }),
    "application/pdf",
    fetchImpl
  );
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * The copy of a document sent to Leegality for Aadhaar eSign: the PDF with
 * an empty form, and its page count for the signers' boxes.
 */
export async function prepareForEsign(
  pdf: Uint8Array,
  fetchImpl: typeof fetch = fetch
): Promise<{ pageCount: number; pdf: Uint8Array }> {
  const response = await post(
    "/pidash/prepare-esign",
    JSON.stringify({ pdf: Buffer.from(pdf).toString("base64") }),
    "application/json",
    fetchImpl
  );
  const body = (await response.json()) as { pageCount: number; pdf: string };
  return {
    pageCount: body.pageCount,
    pdf: new Uint8Array(Buffer.from(body.pdf, "base64")),
  };
}

/** Whether Leegality's copy shows exactly the pages of the one sent. */
export async function samePages(
  pdf: Uint8Array,
  other: Uint8Array,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  const response = await post(
    "/pidash/same-pages",
    JSON.stringify({
      other: Buffer.from(other).toString("base64"),
      pdf: Buffer.from(pdf).toString("base64"),
    }),
    "application/json",
    fetchImpl
  );
  return ((await response.json()) as { same: boolean }).same;
}

/**
 * Checks an Aadhaar eSign copy: KeySeal's report with the changes Leegality
 * makes allowed (fields it adds for each signature), and each signature's
 * page, box and the file's length as it left it.
 */
export async function validateEsignPdf(
  bytes: Uint8Array,
  baseLength?: number,
  fetchImpl: typeof fetch = fetch
): Promise<GovernanceValidationReport> {
  const response = await post(
    "/pidash/validate-esign",
    JSON.stringify({
      base: baseLength ?? null,
      pdf: Buffer.from(bytes).toString("base64"),
    }),
    "application/json",
    fetchImpl
  );
  return (await response.json()) as GovernanceValidationReport;
}
