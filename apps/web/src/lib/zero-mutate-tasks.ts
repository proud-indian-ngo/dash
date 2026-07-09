import type { AsyncTask } from "@pi-dash/zero/context";

interface MutationTaskResult {
  result: Record<string, unknown>;
}

export function shouldDrainMutationAsyncTasks(
  mutationResult: MutationTaskResult
): boolean {
  return !("error" in mutationResult.result);
}

export async function drainBlockingMutationAsyncTasks(
  asyncTasks: readonly AsyncTask[]
): Promise<AsyncTask[]> {
  const { backgroundTasks, blockingTasks } =
    splitMutationAsyncTasks(asyncTasks);
  if (blockingTasks.length > 0) {
    await runMutationAsyncTasksInOrder(blockingTasks);
  }
  return backgroundTasks;
}

export function splitMutationAsyncTasks(asyncTasks: readonly AsyncTask[]): {
  backgroundTasks: AsyncTask[];
  blockingTasks: AsyncTask[];
} {
  const backgroundTasks: AsyncTask[] = [];
  const blockingTasks: AsyncTask[] = [];

  for (const task of asyncTasks) {
    if (task.blocking) {
      blockingTasks.push(task);
    } else {
      backgroundTasks.push(task);
    }
  }

  return { backgroundTasks, blockingTasks };
}

export async function runMutationAsyncTasksInOrder(
  asyncTasks: readonly AsyncTask[]
): Promise<void> {
  for (const task of asyncTasks) {
    // biome-ignore lint/performance/noAwaitInLoops: later mutation side effects can depend on earlier ones.
    await task.fn();
  }
}
