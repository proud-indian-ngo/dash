import { createRequestLogger } from "evlog";

function coerceError(error: unknown): Error | string {
  return error instanceof Error ? error : String(error);
}

/** For mutator async tasks (ctx.asyncTasks). Logs + emits on both success and failure. Does NOT re-throw. */
export async function withTaskLog(
  context: Record<string, unknown>,
  fn: () => Promise<void>
): Promise<void> {
  const log = createRequestLogger();
  log.set(context);
  try {
    await fn();
  } catch (error) {
    log.error(coerceError(error));
  } finally {
    log.emit();
  }
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
