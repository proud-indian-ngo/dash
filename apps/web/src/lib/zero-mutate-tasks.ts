interface MutationTaskResult {
  result: Record<string, unknown>;
}

export function shouldDrainMutationAsyncTasks(
  mutationResult: MutationTaskResult
): boolean {
  return !("error" in mutationResult.result);
}
