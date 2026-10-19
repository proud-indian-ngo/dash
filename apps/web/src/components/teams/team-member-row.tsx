import {
  UserIcon,
  UserRemoveIcon,
  UserStar01Icon,
} from "@hugeicons/core-free-icons";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { TeamMember, User } from "@pi-dash/zero/schema";
import { format } from "date-fns";

import { contactActions } from "@/components/shared/contact-actions";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { RowActionsButton } from "@/components/shared/row-actions-button";
import { Tag } from "@/components/shared/status-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { UserHoverCard } from "@/components/shared/user-hover-card";
import type { ContactState } from "@/hooks/use-contacts";
import { DATE } from "@/lib/date-formats";

export interface MemberRowProps {
  canManage: boolean;
  canRemove: boolean;
  /** Absent for the viewer's own row and for those who cannot manage. */
  contact: ContactState;
  isSoleLeadSelf: boolean;
  member: TeamMember & { user: User | undefined };
  onRemove: (id: string) => void;
  onToggleRole: (memberId: string, currentRole: string) => void;
}

function getRoleToggleTitle(isSoleLeadSelf: boolean, role: string): string {
  if (isSoleLeadSelf && role === "lead") {
    return "You're the only lead";
  }
  if (role === "lead") {
    return "Demote to member";
  }
  return "Promote to lead";
}

export function MemberRow({
  canManage,
  canRemove,
  contact,
  isSoleLeadSelf,
  member,
  onRemove,
  onToggleRole,
}: MemberRowProps) {
  const { user } = member;
  const name = user?.name ?? "Unknown user";
  const role = member.role ?? "member";
  const handleToggleRole = useEventCallback(() =>
    onToggleRole(member.id, role)
  );
  const handleRemove = useEventCallback(() => onRemove(member.id));
  const identity = (
    <>
      <UserAvatar
        className="size-6"
        fallbackClassName="text-[10px]"
        user={user ?? { name: "?" }}
      />
      <span className="truncate text-sm font-medium">{name}</span>
    </>
  );

  return (
    <li
      className="flex min-h-11 items-center gap-3 px-3 py-1.5"
      data-slot="team-member-row"
    >
      {user ? (
        <UserHoverCard
          triggerClassName="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 [@media(pointer:coarse)]:pointer-events-none"
          user={user}
        >
          {identity}
        </UserHoverCard>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          {identity}
        </span>
      )}
      <span className="text-muted-foreground hidden shrink-0 text-xs tabular-nums sm:block">
        Joined {format(member.joinedAt, DATE)}
      </span>
      <Tag className="shrink-0">{role === "lead" ? "Lead" : "Member"}</Tag>
      {canManage || canRemove ? (
        <ResponsiveActionMenu
          actions={[
            ...contactActions(contact),
            canManage && {
              disabled: isSoleLeadSelf && role === "lead",
              icon: role === "lead" ? UserIcon : UserStar01Icon,
              id: "role",
              label: getRoleToggleTitle(isSoleLeadSelf, role),
              onSelect: handleToggleRole,
            },
            canRemove && {
              destructive: true,
              icon: UserRemoveIcon,
              id: "remove",
              label: "Remove from team",
              onSelect: handleRemove,
            },
          ]}
          title={name}
          trigger={<RowActionsButton aria-label={`Actions for ${name}`} />}
        />
      ) : (
        <span aria-hidden="true" className="size-7 shrink-0" />
      )}
    </li>
  );
}
