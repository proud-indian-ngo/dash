/** Runs `fn` over `items` with at most `limit` in flight. */
export async function forEachLimited<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next] as T;
      next += 1;
      await fn(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
}
