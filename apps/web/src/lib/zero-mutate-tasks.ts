import type { AsyncTask } from "@pi-dash/zero/context";

interface MutationTaskResult {
  result: Record<string, unknown>;
}

export function isSuccessfulMutationResult(
  mutationResult: MutationTaskResult
): boolean {
  return !("error" in mutationResult.result);
}

export async function runMutationTasksInOrder(
  tasks: readonly AsyncTask[]
): Promise<void> {
  for (const task of tasks) {
    // biome-ignore lint/performance/noAwaitInLoops: upload copies must finish before the transaction can commit.
    await task.fn();
  }
}

export async function runMutationTasksSettled(
  tasks: readonly AsyncTask[]
): Promise<void> {
  const results = await Promise.allSettled(tasks.map((task) => task.fn()));
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((failure) => failure.reason),
      "One or more mutation tasks failed"
    );
  }
}
