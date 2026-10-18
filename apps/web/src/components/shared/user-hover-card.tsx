import { Calendar04Icon, SmartPhone01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@pi-dash/design-system/components/ui/hover-card";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { format } from "date-fns";
import { type ReactNode, useRef, useState } from "react";

import { Tag } from "@/components/shared/status-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useApp } from "@/context/app-context";
import {
  getUserHoverDetails,
  type UserHoverDetails,
} from "@/functions/user-hover-details";
import { DATE } from "@/lib/date-formats";

interface UserHoverCardUser {
  id: string;
  image?: null | string;
  name: string;
  role?: null | string;
}

interface UserHoverCardProps {
  children?: ReactNode;
  /**
   * Override the trigger element's className. Use when the hover card trigger
   * needs to participate in a parent flex layout (e.g., `flex-1 min-w-0`).
   * Must include `cursor-pointer` for the hover affordance.
   */
  triggerClassName?: string;
  user: UserHoverCardUser;
}

/**
 * Wraps children in a hover card that shows a user profile preview.
 * Displays: avatar, name, email, phone, role badge, and join date.
 * Only fields present on the `user` object are rendered.
 *
 * Disabled on touch devices — hover cards require a pointer.
 */
export function UserHoverCard({
  children,
  triggerClassName,
  user,
}: UserHoverCardProps) {
  const { hasPermission, user: appUser } = useApp();
  const canSeeFullDetails =
    hasPermission("users.view") || user.id === appUser.id;
  const [details, setDetails] = useState<null | UserHoverDetails>(null);
  const requestVersion = useRef(0);
  const stableOnClick0 = useEventCallback(
    (e: { stopPropagation: () => void }) => e.stopPropagation()
  );
  const handleOpenChange = useEventCallback((open: boolean) => {
    requestVersion.current += 1;
    const request = requestVersion.current;
    setDetails(null);
    if (!(open && canSeeFullDetails)) {
      return;
    }
    getUserHoverDetails({ data: { userId: user.id } })
      .then((result) => {
        if (requestVersion.current === request) {
          setDetails(result);
        }
      })
      .catch(() => {
        if (requestVersion.current === request) {
          setDetails(null);
        }
      });
  });

  return (
    <HoverCard onOpenChange={handleOpenChange}>
      <HoverCardTrigger
        aria-label={`View ${user.name}'s profile`}
        render={
          <div
            className={
              triggerClassName ??
              "inline-flex max-w-full cursor-pointer align-middle [@media(pointer:coarse)]:pointer-events-none"
            }
          />
        }
      >
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-64" onClick={stableOnClick0}>
        <div className="flex gap-3">
          <UserAvatar className="size-10 shrink-0" user={user} />
          <div className="min-w-0 space-y-1.5">
            <div>
              <p className="truncate text-sm font-medium">{user.name}</p>
              {details?.email ? (
                <p className="text-muted-foreground truncate text-xs">
                  {details.email}
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              {details?.phone ? (
                <div className="flex items-center gap-1.5">
                  <HugeiconsIcon
                    className="text-muted-foreground size-3.5 shrink-0"
                    icon={SmartPhone01Icon}
                    strokeWidth={2}
                  />
                  <span className="text-muted-foreground truncate text-xs">
                    {details.phone}
                  </span>
                </div>
              ) : null}
              {user.role ? (
                <div className="flex items-center gap-1.5">
                  <Tag>{user.role.replace(/_/g, " ")}</Tag>
                </div>
              ) : null}
              {details?.createdAt ? (
                <div className="flex items-center gap-1.5">
                  <HugeiconsIcon
                    className="text-muted-foreground size-3.5 shrink-0"
                    icon={Calendar04Icon}
                    strokeWidth={2}
                  />
                  <span className="text-muted-foreground text-xs">
                    Joined {format(new Date(details.createdAt), DATE)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
