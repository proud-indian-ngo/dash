import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface ShowInterestDialogProps {
  eventId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function ShowInterestDialog({
  eventId,
  onOpenChange,
  open,
}: ShowInterestDialogProps) {
  const zero = useZero();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setMessage("");
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    const res = await zero.mutate(
      mutators.eventInterest.create({
        id: crypto.randomUUID(),
        eventId,
        message: message.trim() || undefined,
      })
    ).server;
    setIsSubmitting(false);
    if (res.type === "error") {
      toast.error(res.error.message || "Failed to submit interest");
    } else {
      toast.success("Interest submitted!");
      setMessage("");
      onOpenChange(false);
    }
  }, [zero, eventId, message, onOpenChange]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Show Interest</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Label htmlFor="interest-message">Message (optional)</Label>
          <Textarea
            id="interest-message"
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Why are you interested in this event?"
            rows={3}
            value={message}
          />
        </div>
        <DialogFooter>
          <Button
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={isSubmitting} onClick={handleSubmit} type="button">
            {isSubmitting ? "Submitting..." : "Submit Interest"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
