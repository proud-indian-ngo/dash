import { createRequestLogger } from "evlog";
import pRetry from "p-retry";

function coerceError(error: unknown): Error | string {
  return error instanceof Error ? error : String(error);
}

function isHttpClientError(error: Error): boolean {
  if ("status" in error && typeof error.status === "number") {
    return error.status >= 400 && error.status < 500;
  }
  if ("statusCode" in error && typeof error.statusCode === "number") {
    return error.statusCode >= 400 && error.statusCode < 500;
  }
  return false;
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
      retries,
      minTimeout: 500,
      shouldRetry: ({ error }) => !isHttpClientError(error),
      onFailedAttempt: (error) => {
        log.set({
          attempt: error.attemptNumber,
          retriesLeft: error.retriesLeft,
        });
      },
    });
  } catch (error) {
    log.error(coerceError(error));
  } finally {
    log.emit();
  }
}

/** For catch blocks in server functions / API routes. Logs the error with context, emits, and re-throws. */
export function logErrorAndRethrow(
  options: { method: string; path: string },
  context: Record<string, unknown>,
  error: unknown
): never {
  const log = createRequestLogger(options);
  log.set(context);
  log.error(coerceError(error));
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
