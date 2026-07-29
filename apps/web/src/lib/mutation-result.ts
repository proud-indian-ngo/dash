import { log } from "evlog";
import { toast } from "sonner";

interface MutationResultOptions {
  entityId: string;
  errorMsg: string;
  mutation: string;
  showErrorToast?: boolean;
  successMsg?: string;
}

export function getMutationResultErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string" && error) {
    return error;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  ) {
    return error.message;
  }
  return fallback;
}

/**
 * Handles a Zero mutation server result — logs errors via evlog browser log
 * drain and shows appropriate toast.
 */
export function handleMutationResult(
  result: { error?: unknown; type: string },
  {
    mutation,
    entityId,
    successMsg,
    errorMsg,
    showErrorToast = true,
  }: MutationResultOptions
) {
  if (result.type === "error") {
    log.error({
      component: "mutation",
      entityId,
      error: getMutationResultErrorMessage(result.error, "unknown"),
      mutation,
    });
    if (showErrorToast) {
      toast.error(errorMsg);
    }
  } else if (successMsg) {
    toast.success(successMsg);
  }
}
