import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@pi-dash/design-system/components/ui/alert-dialog";
import { type ReactNode, useEffect, useState } from "react";

interface ConfirmDialogProps {
  cancelLabel?: string;
  confirmLabel: string;
  description: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
  variant?: "default" | "destructive";
}

export function ConfirmDialog({
  cancelLabel = "Cancel",
  confirmLabel,
  description,
  loading = false,
  loadingLabel,
  onConfirm,
  onOpenChange,
  open,
  title,
  variant = "destructive",
}: ConfirmDialogProps) {
  const [submitted, setSubmitted] = useState(false);
  const isDisabled = loading || submitted;

  useEffect(() => {
    if (!open) {
      setSubmitted(false);
    }
  }, [open]);

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={isDisabled}
            size="default"
            variant="outline"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isDisabled}
            onClick={() => {
              setSubmitted(true);
              onConfirm();
            }}
            variant={variant}
          >
            {loading && loadingLabel ? loadingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
