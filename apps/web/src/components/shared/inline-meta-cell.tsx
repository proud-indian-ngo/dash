import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { cn } from "@pi-dash/design-system/lib/utils";
import type { ReactNode } from "react";

import { UserAvatar } from "@/components/shared/user-avatar";

/**
 * A table cell with main text and a muted detail on one line, so rows stay
 * 36px. The detail truncates first.
 */
export function InlineMetaCell({
  leading,
  mono = false,
  primary,
  primaryClassName,
  secondary,
}: {
  leading?: ReactNode;
  /** Set the detail in Paper Mono (IDs, emails). */
  mono?: boolean;
  primary: ReactNode;
  primaryClassName?: string;
  secondary?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {leading}
      <span
        className={cn(
          "max-w-full shrink-0 truncate font-medium",
          primaryClassName
        )}
      >
        {primary}
      </span>
      {secondary ? (
        <span
          className={cn(
            "text-muted-foreground min-w-0 truncate text-xs",
            mono && "font-mono"
          )}
        >
          {secondary}
        </span>
      ) : null}
    </div>
  );
}

/** A person in a table row: small avatar, name, and email in the data font. */
export function UserCell({
  user,
}: {
  user: Parameters<typeof UserAvatar>[0]["user"];
}) {
  return (
    <InlineMetaCell
      leading={<UserAvatar className="size-6 shrink-0" user={user} />}
      mono
      primary={user.name}
      secondary={user.email}
    />
  );
}

export const USER_CELL_SKELETON = (
  <div className="flex items-center gap-2">
    <Skeleton className="size-6 rounded-full" />
    <Skeleton className="h-4 w-24" />
    <Skeleton className="h-3 w-28" />
  </div>
);
