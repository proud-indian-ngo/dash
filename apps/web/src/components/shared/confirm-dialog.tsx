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
import type { ReactNode } from "react";

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
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={loading}
            size="default"
            variant="outline"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={onConfirm}
            variant={variant}
          >
            {loading && loadingLabel ? loadingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
