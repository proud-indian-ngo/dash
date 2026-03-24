import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";
import { handleMutationResult } from "@/lib/mutation-result";

interface ShowInterestDialogProps {
  eventDate?: string;
  eventId: string;
  eventName?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function ShowInterestDialog({
  eventDate,
  eventId,
  eventName,
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

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const id = uuidv7();
    const res = await zero.mutate(
      mutators.eventInterest.create({
        id,
        eventId,
        message: message.trim() || undefined,
        now: Date.now(),
      })
    ).server;
    setIsSubmitting(false);
    handleMutationResult(res, {
      mutation: "eventInterest.create",
      entityId: id,
      successMsg: "Interest submitted!",
      errorMsg: "Failed to submit interest",
    });
    if (res.type !== "error") {
      setMessage("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Show Interest{eventName ? `: ${eventName}` : ""}
          </DialogTitle>
          <DialogDescription className={eventDate ? "text-sm" : "sr-only"}>
            {eventDate ?? "Express your interest in this event"}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
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
          <DialogFooter className="mt-4">
            <Button
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Submitting..." : "Submit Interest"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
