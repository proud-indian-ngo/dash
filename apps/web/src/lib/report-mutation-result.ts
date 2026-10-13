import { toast } from "sonner";

import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";

/** Like handleMutationResult, but shows the mutator's own reason (duplicate code, bad lead) under the generic toast. */
export function reportMutationResult(
  res: { error?: unknown; type: string },
  options: {
    entityId: string;
    errorMsg: string;
    mutation: string;
    successMsg: string;
  }
) {
  handleMutationResult(res, { ...options, showErrorToast: false });
  if (res.type === "error") {
    const reason = getMutationResultErrorMessage(res.error, "");
    toast.error(options.errorMsg, reason ? { description: reason } : undefined);
  }
}
