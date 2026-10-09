/**
 * Small in-process TTL cache with a hard entry cap. Per-process like
 * `rate-limit.ts`; entries are dropped oldest-first once the cap is reached,
 * so caller-controlled keys cannot grow memory without bound.
 */
export interface TtlCache<T> {
  get: (key: string, now: number) => T | undefined;
  set: (key: string, value: T, now: number) => void;
}

export function createTtlCache<T>({
  maxEntries,
  ttlMs,
}: {
  maxEntries: number;
  ttlMs: number;
}): TtlCache<T> {
  const entries = new Map<string, { expiresAt: number; value: T }>();
  return {
    get: (key, now) => {
      const entry = entries.get(key);
      if (!entry) {
        return;
      }
      if (now >= entry.expiresAt) {
        entries.delete(key);
        return;
      }
      return entry.value;
    },
    set: (key, value, now) => {
      entries.delete(key);
      while (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) {
          break;
        }
        entries.delete(oldest);
      }
      entries.set(key, { expiresAt: now + ttlMs, value });
    },
  };
}
