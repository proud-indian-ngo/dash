import {
  Cancel01Icon,
  InboxIcon,
  MailOpen01Icon,
  MailOpenIcon,
  MoreVerticalIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import { ScrollArea } from "@pi-dash/design-system/components/ui/scroll-area";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@pi-dash/design-system/components/ui/tooltip";
import { cn } from "@pi-dash/design-system/lib/utils";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";

interface NotificationInboxProps {
  onClose: () => void;
}

interface NotificationRow {
  body: string | null;
  clickAction: string | null;
  createdAt: number | null;
  id: string;
  read: boolean | null;
  title: string | null;
}

function shortTimeAgo(timestamp: number | null): string {
  if (!timestamp) {
    return "";
  }
  return formatDistanceToNowStrict(timestamp, { addSuffix: false })
    .replace(" seconds", "s")
    .replace(" second", "s")
    .replace(" minutes", "m")
    .replace(" minute", "m")
    .replace(" hours", "h")
    .replace(" hour", "h")
    .replace(" days", "d")
    .replace(" day", "d")
    .replace(" months", "mo")
    .replace(" month", "mo")
    .replace(" years", "y")
    .replace(" year", "y");
}

function NotificationItem({
  notification: n,
  onArchive,
  onClick,
  onToggleRead,
}: {
  notification: NotificationRow;
  onArchive: (e: React.MouseEvent, id: string) => void;
  onClick: (id: string, clickAction?: string | null) => void;
  onToggleRead: (e: React.MouseEvent, id: string, isRead: boolean) => void;
}) {
  return (
    <button
      className={cn(
        "group relative flex w-full gap-0 border-border border-b text-left transition-colors last:border-b-0",
        n.clickAction ? "cursor-pointer hover:bg-muted/40" : "cursor-default"
      )}
      onClick={() => onClick(n.id, n.clickAction)}
      type="button"
    >
      <div className={cn("w-1 flex-shrink-0", !n.read && "bg-primary")} />

      <div className="min-w-0 flex-1 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <p
            className={cn(
              "text-[13px] leading-snug",
              n.read ? "text-muted-foreground" : "font-semibold"
            )}
          >
            {n.title}
          </p>
          <span className="mt-0.5 flex-shrink-0 text-muted-foreground/70 text-xs">
            {shortTimeAgo(n.createdAt)}
          </span>
        </div>

        <p
          className={cn(
            "mt-1.5 text-[13px] leading-relaxed",
            n.read ? "text-muted-foreground/70" : "text-muted-foreground"
          )}
        >
          {n.body}
        </p>
      </div>

      <div className="flex flex-shrink-0 items-start gap-0.5 self-center pr-3">
        <Tooltip>
          <TooltipTrigger
            className="p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={(e) => onToggleRead(e, n.id, !!n.read)}
            type="button"
          >
            <HugeiconsIcon
              icon={n.read ? MailOpen01Icon : Tick02Icon}
              size={16}
              strokeWidth={2}
            />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {n.read ? "Mark as unread" : "Mark as read"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            className="p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={(e) => onArchive(e, n.id)}
            type="button"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
          </TooltipTrigger>
          <TooltipContent side="bottom">Archive</TooltipContent>
        </Tooltip>
      </div>
    </button>
  );
}

export function NotificationInboxSkeleton() {
  return (
    <div>
      {[0, 1, 2, 3].map((i) => (
        <div
          className="flex gap-0 border-border border-b last:border-b-0"
          key={`skeleton-${i}`}
        >
          <div className="w-1 bg-muted/50" />
          <div className="flex-1 space-y-2.5 px-4 py-4">
            <div className="flex justify-between gap-3">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-8" />
            </div>
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
      <HugeiconsIcon icon={MailOpenIcon} size={36} strokeWidth={1.5} />
      <p className="text-sm">All caught up</p>
    </div>
  );
}

export function NotificationInbox({ onClose }: NotificationInboxProps) {
  const zero = useZero();
  const navigate = useNavigate();
  const [notifications, result] = useQuery(
    queries.notification.forCurrentUser()
  );
  const isLoading = notifications.length === 0 && result.type !== "complete";
  const hasUnread = notifications.some((n) => !n.read);

  async function handleMarkAllRead() {
    try {
      await zero.mutate(mutators.notification.markAllAsRead({}));
    } catch {
      toast.error("Couldn't mark notifications as read");
    }
  }

  async function handleClick(id: string, clickAction?: string | null) {
    if (clickAction) {
      try {
        await zero.mutate(mutators.notification.markAsRead({ id }));
      } catch {
        /* navigation still proceeds */
      }
      onClose();
      navigate({ to: clickAction });
    }
  }

  async function handleToggleRead(
    e: React.MouseEvent,
    id: string,
    isRead: boolean
  ) {
    e.stopPropagation();
    try {
      if (isRead) {
        await zero.mutate(mutators.notification.markAsUnread({ id }));
      } else {
        await zero.mutate(mutators.notification.markAsRead({ id }));
      }
    } catch {
      toast.error("Couldn't update notification");
    }
  }

  async function handleArchive(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await zero.mutate(mutators.notification.archive({ id }));
    } catch {
      toast.error("Couldn't archive notification");
    }
  }

  function renderContent() {
    if (isLoading) {
      return <NotificationInboxSkeleton />;
    }
    if (notifications.length === 0) {
      return <EmptyState />;
    }
    return (
      <div>
        {notifications.map((n) => (
          <NotificationItem
            key={n.id}
            notification={n}
            onArchive={handleArchive}
            onClick={handleClick}
            onToggleRead={handleToggleRead}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            className="text-muted-foreground"
            icon={InboxIcon}
            size={18}
            strokeWidth={2}
          />
          <span className="font-semibold text-sm">Inbox</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
            <HugeiconsIcon icon={MoreVerticalIcon} size={18} strokeWidth={2} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48 p-1">
            <DropdownMenuItem
              className="gap-2 px-3 py-2 text-sm"
              disabled={!hasUnread}
              onClick={handleMarkAllRead}
            >
              <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={2} />
              Mark all as read
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ScrollArea className="flex-1">{renderContent()}</ScrollArea>
    </div>
  );
}
