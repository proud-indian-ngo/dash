import { useCallback, useState } from "react";

interface DialogEntry {
  type: string;
}

interface UseDialogManagerReturn<T extends DialogEntry> {
  activeDialog: T | null;
  close(): void;
  getData<K extends T["type"]>(type: K): Extract<T, { type: K }> | null;
  isOpen(type: T["type"]): boolean;
  onOpenChange(open: boolean): void;
  open(dialog: T): void;
}

/** Manages a single active dialog at a time. Opening a new dialog closes the previous one. */
export function useDialogManager<
  T extends DialogEntry,
>(): UseDialogManagerReturn<T> {
  const [activeDialog, setActiveDialog] = useState<T | null>(null);

  const open = useCallback((dialog: T) => {
    setActiveDialog(dialog);
  }, []);

  const close = useCallback(() => {
    setActiveDialog(null);
  }, []);

  const onOpenChange = useCallback((o: boolean) => {
    if (!o) {
      setActiveDialog(null);
    }
  }, []);

  const isOpen = useCallback(
    (type: T["type"]) => activeDialog?.type === type,
    [activeDialog]
  );

  const getData = useCallback(
    <K extends T["type"]>(type: K): Extract<T, { type: K }> | null => {
      if (activeDialog?.type === type) {
        return activeDialog as Extract<T, { type: K }>;
      }
      return null;
    },
    [activeDialog]
  );

  return { activeDialog, open, close, onOpenChange, isOpen, getData };
}
