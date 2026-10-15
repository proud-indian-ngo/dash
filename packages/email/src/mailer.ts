import { env } from "@pi-dash/env/server";
import { createRequestLogger } from "evlog";
import { toPlainText } from "react-email";
import { Resend } from "resend";

// Resend's default limit is 5 requests per second per team; spacing request
// starts keeps bulk notification fan-out under it.
const MIN_REQUEST_GAP_MS = 250;
const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_AFTER_MS = 1000;
const REQUEST_TIMEOUT_MS = 10_000;
/** Resend's batch endpoint takes at most 100 emails per request. */
export const BATCH_SIZE = 100;

let client: Resend | undefined;
let nextRequestAt = 0;

export interface EmailAttachment {
  content: Buffer;
  filename: string;
}

export interface EmailMessage {
  /** Files sent with a single email (never through the batch endpoint). */
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  html: string;
  subject: string;
  to: string;
}

export interface SendEmailOptions extends EmailMessage {
  /** Resend dedupes sends with the same key for 24 hours, so job retries don't resend. */
  idempotencyKey?: string;
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

interface ResendResult {
  error: { message: string; name: string; statusCode: number | null } | null;
  headers: Record<string, string> | null;
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

/** Returns the Resend client and sender, or null (with a warning) when unconfigured. */
function configuredClient(
  subject: string
): { client: Resend; from: string } | null {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (!(apiKey && from)) {
    const log = createRequestLogger({ method: "POST", path: "sendEmail" });
    log.set({
      missing: [!apiKey && "RESEND_API_KEY", !from && "EMAIL_FROM"].filter(
        Boolean
      ),
      subject,
    });
    log.warn("email_not_configured");
    log.emit();
    return null;
  }
  client ??= new Resend(apiKey);
  return { client, from };
}

/** Rate-spaced request with retries on `rate_limit_exceeded`; throws `EmailSendError`. */
async function request(send: () => Promise<ResendResult>): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    await waitForRequestSlot();
    const { error, headers } = await send();
    if (!error) {
      return;
    }
    if (error.name !== "rate_limit_exceeded" || attempt >= MAX_ATTEMPTS) {
      throw new EmailSendError(error.name, error.message, error.statusCode);
    }
    await sleep(retryAfterMs(headers));
  }
}

function withPlainText(message: EmailMessage, from: string) {
  return { ...message, from, text: toPlainText(message.html) };
}

/**
 * Sends one email (HTML plus a generated plain-text part) through Resend and
 * throws `EmailSendError` when Resend rejects it, retrying rate-limited
 * requests. Without RESEND_API_KEY or EMAIL_FROM (allowed outside production)
 * the email is skipped with a warning.
 */
export async function sendEmail(
  options: SendEmailOptions
): Promise<SendEmailStatus> {
  const { idempotencyKey, ...message } = options;
  const configured = configuredClient(message.subject);
  if (!configured) {
    return "skipped";
  }
  await request(() =>
    configured.client.emails.send(withPlainText(message, configured.from), {
      idempotencyKey,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  );
  return "sent";
}

export interface BatchFailure {
  error: unknown;
  recipients: string[];
}

export interface SendEmailBatchResult {
  failures: BatchFailure[];
  sent: number;
  skipped: boolean;
}

/**
 * Sends many emails through Resend's batch endpoint, 100 per request. A
 * rejected chunk doesn't stop the rest; it is reported in `failures`. Each
 * chunk's idempotency key is `${idempotencyKey}-${chunkIndex}`, so callers
 * must pass messages in a stable order for retries to dedupe.
 */
export async function sendEmailBatch(
  messages: EmailMessage[],
  idempotencyKey: string
): Promise<SendEmailBatchResult> {
  const result: SendEmailBatchResult = {
    failures: [],
    sent: 0,
    skipped: false,
  };
  const [first] = messages;
  if (!first) {
    return result;
  }
  const configured = configuredClient(first.subject);
  if (!configured) {
    return { ...result, skipped: true };
  }
  for (let start = 0; start < messages.length; start += BATCH_SIZE) {
    const chunk = messages.slice(start, start + BATCH_SIZE);
    try {
      await request(() =>
        configured.client.batch.send(
          chunk.map((message) => withPlainText(message, configured.from)),
          {
            idempotencyKey: `${idempotencyKey}-${start / BATCH_SIZE}`,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          }
        )
      );
      result.sent += chunk.length;
    } catch (error) {
      result.failures.push({
        error,
        recipients: chunk.map((message) => message.to),
      });
    }
  }
  return result;
}

/** Test-only: forget the cached client and rate-limit slot. */
export function resetMailerForTests(): void {
  client = undefined;
  nextRequestAt = 0;
}
