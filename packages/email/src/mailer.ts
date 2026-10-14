import { env } from "@pi-dash/env/server";
import { createRequestLogger } from "evlog";
import { Resend } from "resend";

// Resend's default limit is 5 requests per second per team; spacing request
// starts keeps bulk notification fan-out under it.
const MIN_REQUEST_GAP_MS = 250;
const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_AFTER_MS = 1000;
const REQUEST_TIMEOUT_MS = 10_000;

let client: Resend | undefined;
let nextRequestAt = 0;

export interface SendEmailOptions {
  headers?: Record<string, string>;
  html: string;
  /** Resend dedupes sends with the same key for 24 hours, so job retries don't resend. */
  idempotencyKey?: string;
  subject: string;
  to: string;
}

export type SendEmailStatus = "sent" | "skipped";

export class EmailSendError extends Error {
  readonly code: string;
  readonly statusCode: number | null;

  constructor(code: string, message: string, statusCode: number | null) {
    super(`Resend ${code}: ${message}`);
    this.name = "EmailSendError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRequestSlot(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextRequestAt);
  nextRequestAt = slot + MIN_REQUEST_GAP_MS;
  if (slot > now) {
    await sleep(slot - now);
  }
}

function retryAfterMs(headers: Record<string, string> | null): number {
  const seconds = Number(headers?.["retry-after"]);
  return Number.isFinite(seconds) && seconds > 0
    ? seconds * 1000
    : DEFAULT_RETRY_AFTER_MS;
}

/**
 * Sends one email through Resend and throws `EmailSendError` when Resend
 * rejects it, retrying rate-limited requests. Without RESEND_API_KEY or
 * EMAIL_FROM (allowed outside production) the email is skipped with a warning.
 */
export async function sendEmail(
  options: SendEmailOptions
): Promise<SendEmailStatus> {
  const { idempotencyKey, ...email } = options;
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (!(apiKey && from)) {
    const log = createRequestLogger({ method: "POST", path: "sendEmail" });
    log.set({
      missing: [!apiKey && "RESEND_API_KEY", !from && "EMAIL_FROM"].filter(
        Boolean
      ),
      subject: email.subject,
    });
    log.warn("email_not_configured");
    log.emit();
    return "skipped";
  }

  client ??= new Resend(apiKey);
  for (let attempt = 1; ; attempt++) {
    await waitForRequestSlot();
    const { error, headers } = await client.emails.send(
      { ...email, from },
      { idempotencyKey, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
    );
    if (!error) {
      return "sent";
    }
    if (error.name !== "rate_limit_exceeded" || attempt >= MAX_ATTEMPTS) {
      throw new EmailSendError(error.name, error.message, error.statusCode);
    }
    await sleep(retryAfterMs(headers));
  }
}

/** Test-only: forget the cached client and rate-limit slot. */
export function resetMailerForTests(): void {
  client = undefined;
  nextRequestAt = 0;
}
