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
 * Asks the internal signing service (services/signing) to check every
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

export class SigningServiceError extends Error {}

/**
 * Adds per signer an empty signature field and the read-only answers field
 * it locks to an issued circular. Throws when the service is missing or
 * refuses: a circular without fields can't be signed in place.
 */
export async function prepareSignatureFields(
  pdf: Uint8Array,
  fields: {
    answersBox: [number, number, number, number];
    answersName: string;
    box: [number, number, number, number];
    name: string;
    page: number;
  }[],
  fetchImpl: typeof fetch = fetch
): Promise<Uint8Array> {
  if (!(env.SIGNING_SERVICE_URL && env.SIGNING_SERVICE_TOKEN)) {
    throw new SigningServiceError(
      "Issuing needs the signing service, which isn't set up here."
    );
  }
  const response = await fetchImpl(
    new URL("/prepare", env.SIGNING_SERVICE_URL),
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
      "The signing service couldn't prepare the signature boxes. Try again."
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
      "Signing needs the signing service, which isn't set up here."
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
    throw new SigningServiceError("The signing service couldn't be reached.");
  }
  if (!response.ok) {
    const detail = await response
      .json()
      .then((b: { detail?: unknown }) =>
        typeof b.detail === "string" ? b.detail : null
      )
      .catch(() => null);
    throw new SigningServiceError(
      detail ?? `The signing service answered ${response.status}.`
    );
  }
  return response;
}

/** Whether a certificate (DER in base64) chains to the configured DSC roots. */
export async function certificateTrusted(
  input: { certificate: string; chain: string[] },
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  const response = await post(
    "/certificate",
    JSON.stringify(input),
    "application/json",
    fetchImpl
  );
  return ((await response.json()) as { trusted: boolean }).trusted;
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

/** Reserves the signature in the trustee's field; returns what the token signs. */
export async function startRemoteSignature(
  input: {
    certificate: string;
    chain: string[];
    fieldName: string;
    pdf: Uint8Array;
  },
  fetchImpl: typeof fetch = fetch
): Promise<{ state: string; toSign: string }> {
  const response = await post(
    "/sign/start",
    JSON.stringify({
      certificate: input.certificate,
      chain: input.chain,
      fieldName: input.fieldName,
      pdf: Buffer.from(input.pdf).toString("base64"),
    }),
    "application/json",
    fetchImpl
  );
  return (await response.json()) as { state: string; toSign: string };
}

/** Writes the token's signature (with a TSA timestamp) into the PDF. */
export async function finishRemoteSignature(
  input: { signature: string; state: string },
  fetchImpl: typeof fetch = fetch
): Promise<Uint8Array> {
  const response = await post(
    "/sign/finish",
    JSON.stringify(input),
    "application/json",
    fetchImpl
  );
  return new Uint8Array(await response.arrayBuffer());
}

/** Revocation data and a document timestamp: the long-term copy (PAdES B-LTA). */
export async function finalizeForArchive(
  pdf: Uint8Array,
  fetchImpl: typeof fetch = fetch
): Promise<Uint8Array> {
  const response = await post(
    "/finalize",
    new Blob([new Uint8Array(pdf)], { type: "application/pdf" }),
    "application/pdf",
    fetchImpl
  );
  return new Uint8Array(await response.arrayBuffer());
}
