import type { ReactNode } from "react";

import { AppErrorBoundary } from "@/components/app-error-boundary";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";

interface FormModalProps {
  children: ReactNode;
  description?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** md for short forms; lg (default) for long or two-column forms. */
  size?: "md" | "lg";
  title: string;
}

export function FormModal({
  children,
  description,
  onOpenChange,
  open,
  size = "lg",
  title,
}: FormModalProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className={
          size === "md" ? "sm:max-w-(--dialog-md)" : "sm:max-w-(--dialog-lg)"
        }
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? undefined : "sr-only"}>
            {description ?? "Complete the form below"}
          </DialogDescription>
        </DialogHeader>
        <AppErrorBoundary level="section">{children}</AppErrorBoundary>
      </DialogContent>
    </Dialog>
  );
}
