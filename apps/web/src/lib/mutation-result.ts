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
 * The toast for joining an event: the safeguarding refusal as the server
 * wrote it (it says what to do), anything else as the generic fallback.
 */
export function joinErrorMessage(
  result: { error?: unknown; type: string },
  fallback: string
): string {
  const message =
    result.type === "error"
      ? getMutationResultErrorMessage(result.error, "")
      : "";
  return message.includes("safeguarding policy") ? message : fallback;
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
