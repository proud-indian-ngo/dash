import type { ResultType } from "@rocicorp/zero";

/**
 * True until the server has confirmed a query's rows, in this session or, as
 * `cached`, an earlier one. Pair it with an empty-data check: a confirmed empty
 * result shows its empty state at once instead of a skeleton until reconnect.
 */
export function isAwaitingResult(result: { type: ResultType }) {
  return result.type === "unknown" || result.type === "error";
}
