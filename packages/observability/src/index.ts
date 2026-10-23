import { createRequestLogger } from "evlog";
import pRetry from "p-retry";

function coerceError(error: unknown): Error | string {
  return error instanceof Error ? error : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The first numeric status on the error or its cause, as Start resolves it.
 * better-call's APIError has a string `status` ("BAD_REQUEST") and a numeric
 * `statusCode`.
 */
export function errorStatus(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return undefined;
  }
  const { cause } = error;
  const candidates = [error.status, error.statusCode];
  if (isRecord(cause)) {
    candidates.push(cause.status, cause.statusCode);
  }
  return candidates.find((value): value is number => typeof value === "number");
}

/** A refusal the caller caused: retrying or reporting it would not help. */
function isClientError(error: unknown): boolean {
  const status = errorStatus(error);
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
 * context, emits, and re-throws. A refusal (a 4xx status) is a warning.
 */
export function logErrorAndRethrow(
  options: { method: string; path: string },
  context: Record<string, unknown>,
  error: unknown
): never {
  const log = createRequestLogger(options);
  log.set(context);
  if (error instanceof Error && isClientError(error)) {
    log.set({ errorName: error.name, status: errorStatus(error) });
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
