import { log } from "evlog";
import debounce from "lodash/debounce";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

const showSyncErrorToast = debounce(
  () => toast.error("Failed to sync data. Check your connection."),
  3000,
  { leading: true, trailing: false }
);

/**
 * Monitors a Zero query result for error state transitions and logs
 * them via evlog (browser log drain) + shows a user-facing toast.
 *
 * Toast is debounced at module level so multiple queries erroring
 * simultaneously only show one toast.
 *
 * Use alongside `useQuery` from `@rocicorp/zero/react`:
 * ```ts
 * const [data, result] = useQuery(queries.foo.all());
 * const isLoading = useZeroQueryStatus(result);
 * ```
 */
export function useZeroQueryStatus(result: { type: string }): boolean {
  const prevType = useRef(result.type);

  useEffect(() => {
    if (result.type === "error" && prevType.current !== "error") {
      log.error({
        component: "useZeroQueryStatus",
        message: "Zero query entered error state",
      });
      showSyncErrorToast();
    }
    prevType.current = result.type;
  }, [result.type]);

  return result.type === "unknown";
}
