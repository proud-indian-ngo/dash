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
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { useState } from "react";

interface RejectDialogProps {
  entityLabel: string;
  onConfirm: (reason: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function RejectDialog({
  entityLabel,
  onConfirm,
  onOpenChange,
  open,
}: RejectDialogProps) {
  const [reason, setReason] = useState("");

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reject {entityLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            Provide a reason for rejection. This will be visible to the
            submitter.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          aria-label="Rejection reason"
          className="min-h-24"
          onChange={(e) => setReason(e.target.value)}
          placeholder="Rejection reason..."
          value={reason}
        />
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setReason("")}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason)}
          >
            Reject
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
