import { Label } from "@pi-dash/design-system/components/ui/label";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { VOID_REASON_MAX } from "@pi-dash/shared/ledger";
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

interface VoidDialogProps {
  entityLabel: string;
  loading?: boolean;
  onConfirm: (reason: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/**
 * Voids a request or payment the books hold (finance Option B): it stays,
 * with its attachments and history, and the books reverse it on today's
 * date. The reason goes in the history.
 */
export function VoidDialog({
  entityLabel,
  loading = false,
  onConfirm,
  onOpenChange,
  open,
}: VoidDialogProps) {
  const [reason, setReason] = useState("");
  const handleChange = useEventCallback((e: { target: { value: string } }) =>
    setReason(e.target.value)
  );
  const handleCancel = useEventCallback(() => setReason(""));
  const handleConfirm = useEventCallback(() => onConfirm(reason.trim()));

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Void {entityLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            It stays as a record with its attachments, vouchers and history, but
            can't be changed again. The books reverse it on today's date.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="void-reason">Reason</Label>
          <Textarea
            className="min-h-24"
            id="void-reason"
            maxLength={VOID_REASON_MAX}
            onChange={handleChange}
            placeholder="Why it is void..."
            value={reason}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!reason.trim() || loading}
            onClick={handleConfirm}
            variant="destructive"
          >
            {loading ? "Voiding..." : "Void"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
