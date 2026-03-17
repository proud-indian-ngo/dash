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

interface ApproveDialogProps {
  entityLabel: string;
  onConfirm: (message: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function ApproveDialog({
  entityLabel,
  onConfirm,
  onOpenChange,
  open,
}: ApproveDialogProps) {
  const [message, setMessage] = useState("");

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Approve {entityLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            This action will approve the {entityLabel} and notify the submitter.
            You can optionally add a message.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          aria-label="Optional message"
          className="min-h-20"
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Optional message to the submitter..."
          value={message}
        />
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setMessage("")}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm(message)}>
            Approve
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
