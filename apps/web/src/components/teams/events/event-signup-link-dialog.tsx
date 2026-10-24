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
import { createEventSignupLinkFn } from "@/functions/event-signup-links";
import { DATE_TIME } from "@/lib/date-formats";
import { getErrorMessage } from "@/lib/errors";

/**
 * An event's sign-up link: whoever creates an account through it joins the
 * event. The link is signed, so a public event ID alone enrolls no one.
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
  const [link, setLink] = useState<{ expiresAt: number; url: string } | null>(
    null
  );
  const [pending, setPending] = useState(false);

  const handleOpenChange = useEventCallback((next: boolean) => {
    if (!next) {
      setLink(null);
    }
    onOpenChange(next);
  });
  const handleCreate = useEventCallback(async () => {
    setPending(true);
    try {
      const result = await createLink({ data: { eventId } });
      const url = new URL("/register", window.location.origin);
      url.searchParams.set("eventId", result.eventId);
      url.searchParams.set("sig", result.sig);
      setLink({ expiresAt: result.expiresAt, url: url.toString() });
    } catch (error) {
      log.error({
        action: "createEventSignupLink",
        component: "EventSignupLinkDialog",
        error: getErrorMessage(error),
      });
      toast.error(getErrorMessage(error) || "Couldn't get the link");
    }
    setPending(false);
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
              <p className="text-sm">
                It works until the event starts, on{" "}
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
          <DialogFooter>
            <Button disabled={pending} onClick={handleCreate} type="button">
              Get link
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
