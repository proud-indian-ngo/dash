import { Calendar04Icon, SmartPhone01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@pi-dash/design-system/components/ui/hover-card";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { LONG_DATE } from "@/lib/date-formats";

interface UserHoverCardUser {
  createdAt?: null | number | string;
  email?: null | string;
  gender?: null | string;
  image?: null | string;
  name: string;
  phone?: null | string;
  role?: null | string;
}

interface UserHoverCardProps {
  children: ReactNode;
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
  return (
    <HoverCard>
      <HoverCardTrigger
        aria-label={`View ${user.name}'s profile`}
        render={
          <div
            className={
              triggerClassName ??
              "inline-flex cursor-pointer [@media(pointer:coarse)]:pointer-events-none"
            }
          />
        }
      >
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-64" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-3">
          <UserAvatar className="size-10 shrink-0" user={user} />
          <div className="min-w-0 space-y-1.5">
            <div>
              <p className="truncate font-medium text-sm">{user.name}</p>
              {user.email ? (
                <p className="truncate text-muted-foreground text-xs">
                  {user.email}
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              {user.phone ? (
                <div className="flex items-center gap-1.5">
                  <HugeiconsIcon
                    className="size-3.5 shrink-0 text-muted-foreground"
                    icon={SmartPhone01Icon}
                    strokeWidth={2}
                  />
                  <span className="truncate text-muted-foreground text-xs">
                    {user.phone}
                  </span>
                </div>
              ) : null}
              {user.role ? (
                <div className="flex items-center gap-1.5">
                  <Badge
                    size="xs"
                    variant={
                      user.role === "admin" ? "info-outline" : "secondary"
                    }
                  >
                    {user.role.replace(/_/g, " ")}
                  </Badge>
                </div>
              ) : null}
              {user.createdAt ? (
                <div className="flex items-center gap-1.5">
                  <HugeiconsIcon
                    className="size-3.5 shrink-0 text-muted-foreground"
                    icon={Calendar04Icon}
                    strokeWidth={2}
                  />
                  <span className="text-muted-foreground text-xs">
                    Joined {format(new Date(user.createdAt), LONG_DATE)}
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
