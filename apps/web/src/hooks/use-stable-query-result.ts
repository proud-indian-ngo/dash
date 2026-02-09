import { useRef } from "react";

/**
 * Stabilises a Zero query result by holding the last known-good value
 * while the query is in the "unknown" (loading / reconnecting) state.
 */
export function useStableQueryResult<T>(
  data: T[],
  result: { type: string }
): T[] {
  const ref = useRef(data);
  if (result.type !== "unknown") {
    ref.current = data;
  }
  return ref.current;
}
