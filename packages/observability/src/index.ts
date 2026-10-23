import { createRequestLogger } from "evlog";
import pRetry from "p-retry";

function coerceError(error: unknown): Error | string {
  return error instanceof Error ? error : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The first numeric `status` or `statusCode` on a record. */
function numericStatus(value: unknown): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return [value.status, value.statusCode].find(
    (status): status is number => typeof status === "number"
  );
}

/**
 * Errors whose status means the caller's request was refused: our own, and
 * better-call's APIError (better-auth refusing the request; its `status` is a
 * string such as "BAD_REQUEST", its `statusCode` the number). Matched by
 * name, since the drain sees only the serialized error. Clients that copy an
 * upstream API's status (CloudApiError, RazorpayApiError, EmailSendError)
 * are not listed: a 401 from Meta or Razorpay is an expired token, our fault.
 * A renamed class drops out and is reported, the safe side.
 */
const REFUSAL_NAMES = new Set([
  "APIError",
  "HttpError",
  "PartyConflictError",
  "PrivateMediaAccessError",
  "R2ObjectAccessError",
]);

/**
 * The status of a refusal on the error or its cause, as Start answers it;
 * undefined for anything else, whatever status it carries.
 */
export function refusalStatus(error: unknown): number | undefined {
  for (const candidate of [error, isRecord(error) ? error.cause : undefined]) {
    if (
      isRecord(candidate) &&
      typeof candidate.name === "string" &&
      REFUSAL_NAMES.has(candidate.name)
    ) {
      const status = numericStatus(candidate);
      if (status !== undefined) {
        return status;
      }
    }
  }
  return undefined;
}

function isRefusal(error: unknown): boolean {
  const status = refusalStatus(error);
  return status !== undefined && status >= 400 && status < 500;
}

/**
 * A 4xx from us or an upstream API: retrying the same request would get the
 * same answer.
 */
function isClientError(error: unknown): boolean {
  const status =
    numericStatus(error) ??
    numericStatus(isRecord(error) ? error.cause : undefined);
  return status !== undefined && status >= 400 && status < 500;
}

/** For mutator async tasks (ctx.asyncTasks). Retries with exponential backoff, logs + emits on both success and failure. Does NOT re-throw. */
export async function withTaskLog(
  context: Record<string, unknown>,
  fn: () => Promise<void>,
  options?: { retries?: number }
): Promise<void> {
  const { retries = 3 } = options ?? {};
  const log = createRequestLogger();
  log.set(context);
  try {
    await pRetry(fn, {
      minTimeout: 500,
      onFailedAttempt: (error) => {
        log.set({
          attempt: error.attemptNumber,
          retriesLeft: error.retriesLeft,
        });
      },
      retries,
      shouldRetry: ({ error }) => !isClientError(error),
    });
  } catch (error) {
    log.error(coerceError(error));
  } finally {
    log.emit();
  }
}

/**
 * For catch blocks in server functions / API routes. Logs the error with
 * context, emits, and re-throws. A refusal (see `refusalStatus`) is a warning.
 */
export function logErrorAndRethrow(
  options: { method: string; path: string },
  context: Record<string, unknown>,
  error: unknown
): never {
  const log = createRequestLogger(options);
  log.set(context);
  if (error instanceof Error && isRefusal(error)) {
    log.set({ errorName: error.name, status: refusalStatus(error) });
    log.warn(error.message);
  } else {
    log.error(coerceError(error));
  }
  log.emit();
  throw error;
}

/** For fire-and-forget promises. Emits on both success and failure. */
export function withFireAndForgetLog(
  context: Record<string, unknown>,
  fn: () => Promise<void>
): void {
  const log = createRequestLogger();
  log.set(context);
  fn()
    .catch((error) => {
      log.error(coerceError(error));
    })
    .finally(() => {
      log.emit();
    });
}
