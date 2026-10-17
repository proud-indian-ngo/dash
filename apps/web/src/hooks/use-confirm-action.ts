import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useState } from "react";

import { handleMutationResult } from "@/lib/mutation-result";

interface MutationMeta<TPayload> {
  entityId: string | ((payload: TPayload) => string);
  errorMsg: string;
  mutation: string;
  successMsg: string;
}

interface UseConfirmActionOptions<TPayload = void> {
  mutationMeta?: MutationMeta<TPayload>;
  onConfirm: (
    payload: TPayload
  ) => Promise<{ type: string; error?: { message?: string } }>;
  onError?: (message?: string) => void;
  onSuccess?: () => void;
}

interface UseConfirmActionReturn<TPayload = void> {
  cancel: () => void;
  confirm: () => void;
  isLoading: boolean;
  isOpen: boolean;
  payload: TPayload | null;
  trigger: TPayload extends void ? () => void : (payload: TPayload) => void;
}

export function useConfirmAction<TPayload = void>(
  options: UseConfirmActionOptions<TPayload>
): UseConfirmActionReturn<TPayload> {
  const [payload, setPayload] = useState<TPayload | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const trigger = (p?: TPayload) => {
    setPayload(p === undefined ? (null as TPayload | null) : p);
    setIsOpen(true);
  };

  const cancel = () => {
    setIsOpen(false);
    setIsLoading(false);
    setPayload(null);
  };

  // `options` stays this render's value across the await. Zero can re-render
  // mid-flight with stale derived values (a successMsg built from a count that
  // drops to 0), so do not read options through a ref here.
  const confirm = useEventCallback(async () => {
    if (!isOpen) {
      return;
    }
    const typedPayload = payload as TPayload;
    setIsLoading(true);
    const res = await options.onConfirm(typedPayload);
    setIsLoading(false);

    const { mutationMeta } = options;
    if (mutationMeta) {
      const entityId =
        typeof mutationMeta.entityId === "function"
          ? mutationMeta.entityId(typedPayload)
          : mutationMeta.entityId;
      handleMutationResult(res, {
        entityId,
        errorMsg: mutationMeta.errorMsg,
        mutation: mutationMeta.mutation,
        successMsg: mutationMeta.successMsg,
      });
    }

    if (res.type === "error") {
      if (!mutationMeta) {
        options.onError?.(res.error?.message);
      }
    } else {
      options.onSuccess?.();
      setIsOpen(false);
      setPayload(null);
    }
  });

  return {
    cancel,
    confirm,
    isLoading,
    isOpen,
    payload,
    trigger: trigger as UseConfirmActionReturn<TPayload>["trigger"],
  };
}
