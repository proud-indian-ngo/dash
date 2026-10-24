import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import {
  createEventSignupLinkFn,
  turnOffEventSignupLinkFn,
} from "@/functions/event-signup-links";
import { DATE_TIME } from "@/lib/date-formats";
import { getErrorMessage } from "@/lib/errors";

/**
 * An event's sign-up link: whoever creates an account through it joins the
 * event. Only its hash is stored, so a link is shown once, when created.
 */
export function EventSignupLinkDialog({
  eventId,
  eventName,
  onOpenChange,
  open,
}: {
  eventId: string;
  eventName: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const createLink = useServerFn(createEventSignupLinkFn);
  const turnOffLink = useServerFn(turnOffEventSignupLinkFn);
  const [link, setLink] = useState<{ expiresAt: number; url: string } | null>(
    null
  );
  const [pending, setPending] = useState<"create" | "turn-off" | null>(null);

  const handleOpenChange = useEventCallback((next: boolean) => {
    if (!next) {
      setLink(null);
    }
    onOpenChange(next);
  });
  const handleCreate = useEventCallback(async () => {
    setPending("create");
    try {
      const result = await createLink({ data: { eventId } });
      const url = new URL("/register", window.location.origin);
      url.searchParams.set("eventInvite", result.token);
      setLink({ expiresAt: result.expiresAt, url: url.toString() });
    } catch (error) {
      log.error({
        action: "createEventSignupLink",
        component: "EventSignupLinkDialog",
        error: getErrorMessage(error),
      });
      toast.error(getErrorMessage(error) || "Couldn't create the link");
    }
    setPending(null);
  });
  const handleTurnOff = useEventCallback(async () => {
    setPending("turn-off");
    try {
      await turnOffLink({ data: { eventId } });
      toast.success("Sign-up link turned off");
      handleOpenChange(false);
    } catch (error) {
      log.error({
        action: "turnOffEventSignupLink",
        component: "EventSignupLinkDialog",
        error: getErrorMessage(error),
      });
      toast.error(getErrorMessage(error) || "Couldn't turn off the link");
    }
    setPending(null);
  });
  const handleCopy = useEventCallback(async () => {
    if (!link) {
      return;
    }
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it manually.");
    }
  });
  const handleDone = useEventCallback(() => handleOpenChange(false));

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>Sign-up link</DialogTitle>
          <DialogDescription>
            Anyone who creates a dashboard account through this link joins{" "}
            {eventName}. Share it only with people you are inviting.
          </DialogDescription>
        </DialogHeader>
        {link ? (
          <>
            <div className="grid gap-3">
              <p className="text-sm" role="alert">
                Copy the link now; it cannot be shown again. It stops working
                when the event starts, on{" "}
                {format(new Date(link.expiresAt), DATE_TIME)}.
              </p>
              <div className="flex gap-2">
                <Input
                  aria-label="Sign-up link"
                  className="font-mono"
                  onFocus={(event) => event.target.select()}
                  readOnly
                  value={link.url}
                />
                <Button onClick={handleCopy} type="button" variant="outline">
                  Copy
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleDone} type="button">
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              Creating a link turns off the one made before it. Turn the link
              off if it reached someone it shouldn't have.
            </p>
            <DialogFooter>
              <Button
                disabled={pending !== null}
                onClick={handleTurnOff}
                type="button"
                variant="outline"
              >
                Turn off link
              </Button>
              <Button
                disabled={pending !== null}
                onClick={handleCreate}
                type="button"
              >
                Create link
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
