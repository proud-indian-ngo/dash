import type { ComponentProps } from "react";

import { UserAvatar } from "@/components/shared/user-avatar";
import { UserHoverCard } from "@/components/shared/user-hover-card";

/** "Requested by" with the person's avatar, for a request's `PageHeader` meta. */
export function RequesterMeta({
  user,
}: {
  user: ComponentProps<typeof UserHoverCard>["user"] &
    ComponentProps<typeof UserAvatar>["user"];
}) {
  return (
    <span className="flex items-center gap-1.5">
      Requested by
      <UserHoverCard user={user}>
        <span className="text-foreground flex items-center gap-1.5 font-medium">
          <UserAvatar
            className="size-5"
            fallbackClassName="text-[10px]"
            user={user}
          />
          {user.name}
        </span>
      </UserHoverCard>
    </span>
  );
}
