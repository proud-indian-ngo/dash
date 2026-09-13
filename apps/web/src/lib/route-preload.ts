import type {
  DefaultContext,
  DefaultSchema,
  QueryOrQueryRequest,
  ReadonlyJSONValue,
  Zero,
} from "@rocicorp/zero";

/** Warm a route query without retaining its preload subscription indefinitely. */
export function preloadRouteQuery<
  TTable extends keyof DefaultSchema["tables"] & string,
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TReturn,
>(
  zero: Zero | undefined,
  query: QueryOrQueryRequest<
    TTable,
    TInput,
    TOutput,
    DefaultSchema,
    TReturn,
    DefaultContext
  >,
  signal: AbortSignal
): void {
  if (!zero || signal.aborted) {
    return;
  }

  const { complete, cleanup } = zero.preload(query, { ttl: "5m" });
  let released = false;
  let timeout: ReturnType<typeof setTimeout>;

  const release = () => {
    if (released) {
      return;
    }
    released = true;
    clearTimeout(timeout);
    signal.removeEventListener("abort", release);
    cleanup();
  };

  timeout = setTimeout(release, 30_000);
  signal.addEventListener("abort", release, { once: true });
  if (signal.aborted) {
    release();
  }
  void complete.then(release, release);
}
