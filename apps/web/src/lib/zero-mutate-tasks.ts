import type { AsyncTask } from "@pi-dash/zero/context";

interface MutationTaskResult {
  result: Record<string, unknown>;
}

export function shouldDrainMutationAsyncTasks(
  mutationResult: MutationTaskResult
): boolean {
  return !("error" in mutationResult.result);
}

export function splitMutationAsyncTasks(asyncTasks: readonly AsyncTask[]): {
  backgroundTasks: AsyncTask[];
  blockingTasks: AsyncTask[];
} {
  let lastBlockingIndex = -1;
  for (let index = asyncTasks.length - 1; index >= 0; index -= 1) {
    if (asyncTasks[index]?.blocking) {
      lastBlockingIndex = index;
      break;
    }
  }

  if (lastBlockingIndex < 0) {
    return { backgroundTasks: [...asyncTasks], blockingTasks: [] };
  }

  const blockingTasks = asyncTasks.slice(0, lastBlockingIndex + 1);
  const backgroundTasks = asyncTasks.slice(lastBlockingIndex + 1);

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
