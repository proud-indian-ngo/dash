import { UserRemoveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import type { TeamMember, User } from "@pi-dash/zero/schema";
import { format } from "date-fns";
import { UserAvatar } from "@/components/shared/user-avatar";
import { UserHoverCard } from "@/components/shared/user-hover-card";
import { SHORT_DATE } from "@/lib/date-formats";

export interface MemberRowProps {
  canManage: boolean;
  canRemove: boolean;
  isSoleLeadSelf: boolean;
  member: TeamMember & { user: User | undefined };
  onRemove: (id: string) => void;
  onToggleRole: (memberId: string, currentRole: string) => void;
}

function getRoleToggleTitle(isSoleLeadSelf: boolean, role: string): string {
  if (isSoleLeadSelf && role === "lead") {
    return "You are the only lead — promote another member first";
  }
  if (role === "lead") {
    return "Demote to member";
  }
  return "Promote to lead";
}

export function MemberRow({
  canManage,
  canRemove,
  isSoleLeadSelf,
  member,
  onRemove,
  onToggleRole,
}: MemberRowProps) {
  const user = member.user;
  return (
    <div className="flex items-center justify-between border-b px-3 py-2.5 last:border-0">
      {user ? (
        <UserHoverCard
          triggerClassName="flex cursor-pointer items-center gap-3 [@media(pointer:coarse)]:pointer-events-none"
          user={user}
        >
          <UserAvatar className="size-8" user={user} />
          <div>
            <div className="font-medium text-sm">{user.name}</div>
            <div className="text-muted-foreground text-xs">
              Joined {format(member.joinedAt, SHORT_DATE)}
            </div>
          </div>
        </UserHoverCard>
      ) : (
        <div className="flex items-center gap-3">
          <UserAvatar className="size-8" user={{ name: "?" }} />
          <div>
            <div className="font-medium text-sm">Unknown user</div>
            <div className="text-muted-foreground text-xs">
              Joined {format(member.joinedAt, SHORT_DATE)}
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Badge variant={member.role === "lead" ? "default" : "secondary"}>
          {member.role === "lead" ? "Lead" : "Member"}
        </Badge>
        {canManage ? (
          <Button
            disabled={isSoleLeadSelf && member.role === "lead"}
            onClick={() => onToggleRole(member.id, member.role ?? "member")}
            size="sm"
            title={getRoleToggleTitle(isSoleLeadSelf, member.role ?? "member")}
            type="button"
            variant="ghost"
          >
            {member.role === "lead" ? "Demote" : "Promote"}
          </Button>
        ) : null}
        {canRemove ? (
          <Button
            aria-label={`Remove ${user?.name ?? "member"}`}
            className="size-8"
            onClick={() => onRemove(member.id)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              className="size-4 text-destructive"
              icon={UserRemoveIcon}
              strokeWidth={2}
            />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
