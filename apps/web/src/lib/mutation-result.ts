import { log } from "evlog";
import { toast } from "sonner";

interface MutationResultOptions {
  entityId: string;
  errorMsg: string;
  mutation: string;
  successMsg: string;
}

/**
 * Handles a Zero mutation server result — logs errors via evlog browser log
 * drain and shows appropriate toast.
 */
export function handleMutationResult(
  result: { error?: unknown; type: string },
  { mutation, entityId, successMsg, errorMsg }: MutationResultOptions
) {
  if (result.type === "error") {
    log.error({
      component: "mutation",
      entityId,
      error:
        result.error instanceof Error
          ? result.error.message
          : String(result.error ?? "unknown"),
      mutation,
    });
    toast.error(errorMsg);
  } else {
    toast.success(successMsg);
  }
}
