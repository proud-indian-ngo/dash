import { useCallback, useRef, useState } from "react";
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
  cancel(): void;
  confirm(): void;
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

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const trigger = useCallback((p?: TPayload) => {
    setPayload(p === undefined ? (null as TPayload | null) : p);
    setIsOpen(true);
  }, []);

  const cancel = useCallback(() => {
    setIsOpen(false);
    setIsLoading(false);
    setPayload(null);
  }, []);

  const confirm = useCallback(async () => {
    if (!isOpen) {
      return;
    }
    // Snapshot before await — Zero reactivity can re-render the component
    // mid-flight, overwriting optionsRef.current with stale derived values
    // (e.g. successMsg built from pendingPhotos.length which becomes 0).
    const snapshot = optionsRef.current;
    setIsLoading(true);
    const res = await snapshot.onConfirm(payload as TPayload);
    setIsLoading(false);

    const { mutationMeta } = snapshot;
    if (mutationMeta) {
      const entityId =
        typeof mutationMeta.entityId === "function"
          ? mutationMeta.entityId(payload as TPayload)
          : mutationMeta.entityId;
      handleMutationResult(res, {
        mutation: mutationMeta.mutation,
        entityId,
        successMsg: mutationMeta.successMsg,
        errorMsg: mutationMeta.errorMsg,
      });
    }

    if (res.type === "error") {
      if (!mutationMeta) {
        snapshot.onError?.(res.error?.message);
      }
    } else {
      snapshot.onSuccess?.();
      setIsOpen(false);
      setPayload(null);
    }
  }, [isOpen, payload]);

  return {
    isOpen,
    isLoading,
    payload,
    trigger: trigger as UseConfirmActionReturn<TPayload>["trigger"],
    confirm,
    cancel,
  };
}
