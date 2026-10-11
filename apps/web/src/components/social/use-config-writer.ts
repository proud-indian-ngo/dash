import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";

import { handleMutationResult } from "@/lib/mutation-result";

/**
 * Write one social app_config key through `appConfig.upsert`, or
 * `appConfig.remove` when the value is blank. Resolves true on success.
 */
export function useConfigWriter() {
  const zero = useZero();
  return async (key: string, value: string, successMsg?: string) => {
    const trimmed = value.trim();
    const res = await zero.mutate(
      trimmed
        ? mutators.appConfig.upsert({ key, value: trimmed })
        : mutators.appConfig.remove({ key })
    ).server;
    handleMutationResult(res, {
      entityId: key,
      errorMsg: "Couldn't save social setting",
      mutation: trimmed ? "appConfig.upsert" : "appConfig.remove",
      successMsg,
    });
    return res.type !== "error";
  };
}
