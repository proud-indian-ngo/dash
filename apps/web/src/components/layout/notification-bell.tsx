import { NotificationIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@pi-dash/design-system/components/ui/popover";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useIsMobile } from "@pi-dash/design-system/hooks/use-mobile";
import { cn } from "@pi-dash/design-system/lib/utils";
import { useEffect, useId, useRef, useState } from "react";

import { NotificationInbox } from "@/components/layout/notification-inbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { useUnreadNotificationCount } from "@/hooks/use-unread-notification-count";

/** Pulses the unread dot each time the count goes up. */
function useUnreadPulse(unreadCount: number) {
  const [token, setToken] = useState(0);
  const previous = useRef(unreadCount);
  useEffect(() => {
    if (unreadCount > previous.current) {
      setToken((current) => current + 1);
    }
    previous.current = unreadCount;
  }, [unreadCount]);
  return token;
}

/**
 * The one way into notifications. On desktop the inbox opens in a popover
 * anchored to the bell; on phones, where the bell sits in the top bar, it
 * opens as a bottom drawer.
 */
export function NotificationBell({
  align = "end",
  className,
  dotClassName,
  side = "right",
}: {
  align?: "center" | "end" | "start";
  className?: string;
  /** Ring colour around the unread dot, to match the surface behind the bell. */
  dotClassName?: string;
  side?: "bottom" | "left" | "right" | "top";
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const unreadCount = useUnreadNotificationCount();
  const pulseToken = useUnreadPulse(unreadCount);
  const hasUnread = unreadCount > 0;
  const unreadLabel = unreadCount > 99 ? "99+" : unreadCount;
  const close = useEventCallback(() => setOpen(false));

  const bell = (
    <Button
      onClick={isMobile ? () => setOpen(true) : undefined}
      aria-label={
        hasUnread ? `Notifications, ${unreadLabel} unread` : "Notifications"
      }
      className={cn("relative shrink-0", className)}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <HugeiconsIcon icon={NotificationIcon} strokeWidth={2} />
      {hasUnread ? (
        <span
          aria-hidden="true"
          className="fade-in-0 zoom-in-0 animate-in ease-out-expo absolute top-1 right-1 size-2 transition-all duration-150"
        >
          <span
            className={cn(
              "bg-destructive ring-background block size-full rounded-full ring-2",
              dotClassName,
              pulseToken > 0 && "animate-badge-pulse"
            )}
            key={`bell-badge-${pulseToken}`}
          />
        </span>
      ) : null}
    </Button>
  );

  if (isMobile) {
    return (
      <>
        {bell}
        <Dialog onOpenChange={setOpen} open={open}>
          <DialogContent aria-labelledby={titleId}>
            <DialogHeader>
              <DialogTitle id={titleId}>Notifications</DialogTitle>
              <DialogDescription className="sr-only">
                Your recent notifications.
              </DialogDescription>
            </DialogHeader>
            <div className="h-[min(480px,65dvh)] min-h-0">
              <NotificationInbox onClose={close} />
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger render={bell} />
      <PopoverContent
        align={align}
        aria-label="Notifications"
        className="w-96 p-0"
        side={side}
        // The bell sits inside the sidebar; this clears the sidebar's edge.
        sideOffset={16}
      >
        <div className="h-[min(480px,calc(100dvh-6rem))] min-h-0">
          <NotificationInbox onClose={close} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
