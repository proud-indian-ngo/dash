import { Button } from "@pi-dash/design-system/components/ui/button";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { handleMutationResult } from "@/lib/mutation-result";

interface ShowInterestDialogProps {
  eventDate?: string;
  eventId: string;
  eventName?: string;
  /**
   * Session of a recurring series when viewing a virtual occurrence: the
   * interest is filed on that session, which is materialized and opened.
   */
  occDate?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** Existing row for `occDate`, when that session is already materialized. */
  sessionId?: string;
}

export function ShowInterestDialog({
  eventDate,
  eventId,
  eventName,
  occDate,
  onOpenChange,
  open,
  sessionId,
}: ShowInterestDialogProps) {
  const zero = useZero();
  const navigate = useNavigate();
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
    const materializedId = occDate && !sessionId ? uuidv7() : undefined;
    const res = await zero.mutate(
      mutators.eventInterest.create({
        eventId: sessionId ?? eventId,
        id,
        ...(materializedId ? { materializedId, occDate } : {}),
        message: message.trim() || undefined,
        now: Date.now(),
      })
    ).server;
    setIsSubmitting(false);
    handleMutationResult(res, {
      entityId: id,
      errorMsg: "Failed to submit interest",
      mutation: "eventInterest.create",
      successMsg: "Interest submitted!",
    });
    if (res.type !== "error") {
      setMessage("");
      onOpenChange(false);
      const targetSessionId = sessionId ?? materializedId;
      if (targetSessionId) {
        // The interest lives on the session row; open it to show the status.
        navigate({ params: { id: targetSessionId }, to: "/events/$id" });
      }
    }
  };
  const stableOnSubmit0 = useEventCallback(
    (e: { preventDefault: () => void }) => {
      e.preventDefault();
      handleSubmit();
    }
  );
  const stableOnChange1 = useEventCallback((e: { target: { value: string } }) =>
    setMessage(e.target.value)
  );
  const stableOnClick2 = useEventCallback(() => onOpenChange(false));

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
        <form onSubmit={stableOnSubmit0}>
          <div className="flex flex-col gap-3">
            <Label htmlFor="interest-message">Message (optional)</Label>
            <Textarea
              id="interest-message"
              onChange={stableOnChange1}
              placeholder="Why are you interested in this event?"
              rows={3}
              value={message}
            />
          </div>
          <DialogFooter className="mt-4">
            <Button
              disabled={isSubmitting}
              onClick={stableOnClick2}
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
