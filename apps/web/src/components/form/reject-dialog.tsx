import { Label } from "@pi-dash/design-system/components/ui/label";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shared/responsive-alert-dialog";

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
        <div className="flex flex-col gap-2">
          <Label htmlFor="reject-reason">Reason</Label>
          <Textarea
            className="min-h-24"
            id="reject-reason"
            onChange={(e) => setReason(e.target.value)}
            placeholder="Rejection reason..."
            value={reason}
          />
        </div>
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
