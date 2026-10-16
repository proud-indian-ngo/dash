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
 * checked again later.
 */
export async function validateSignedPdf(
  bytes: Uint8Array,
  fetchImpl: typeof fetch = fetch
): Promise<GovernanceValidationReport> {
  if (!(env.SIGNING_SERVICE_URL && env.SIGNING_SERVICE_TOKEN)) {
    return unavailable("The signing service isn't configured");
  }
  try {
    const response = await fetchImpl(
      new URL("/validate", env.SIGNING_SERVICE_URL),
      {
        body: new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
        headers: {
          Authorization: `Bearer ${env.SIGNING_SERVICE_TOKEN}`,
          "Content-Type": "application/pdf",
        },
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    if (!response.ok) {
      return unavailable(`The signing service answered ${response.status}`);
    }
    return (await response.json()) as GovernanceValidationReport;
  } catch {
    return unavailable("The signing service couldn't be reached");
  }
}
