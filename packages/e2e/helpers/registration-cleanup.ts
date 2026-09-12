import type { TestInfo } from "@playwright/test";

// Teardown must attempt every resource even when a timed-out page is closed.
// Report secondary errors without replacing the original assertion/timeout.
export async function registrationCleanup(
  tasks: readonly (() => Promise<unknown>)[],
  primaryFailed: boolean,
  testInfo: Pick<TestInfo, "annotations">
): Promise<void> {
  const errors: unknown[] = [];
  for (const task of tasks) {
    try {
      await task();
    } catch (error) {
      errors.push(error);
      testInfo.annotations.push({
        type: "cleanup-error",
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (errors.length && !primaryFailed)
    throw new AggregateError(errors, "Registration fixture cleanup failed");
}
