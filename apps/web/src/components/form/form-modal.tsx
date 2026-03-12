import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import type { ReactNode } from "react";
import { AppErrorBoundary } from "@/components/app-error-boundary";

interface FormModalProps {
  children: ReactNode;
  description?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}

export function FormModal({
  children,
  description,
  onOpenChange,
  open,
  title,
}: FormModalProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] w-[min(96vw,56rem)]! max-w-4xl! overflow-y-auto sm:max-w-4xl!">
        <div className="flex items-start justify-between gap-3">
          <DialogHeader className="flex-1 place-items-start text-left">
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
        </div>
        <AppErrorBoundary level="section">{children}</AppErrorBoundary>
      </DialogContent>
    </Dialog>
  );
}
