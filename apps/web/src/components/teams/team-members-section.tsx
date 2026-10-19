import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { TeamMember, User } from "@pi-dash/zero/schema";

import { MemberRow } from "@/components/teams/team-member-row";
import { getTeamMemberContacts } from "@/functions/contacts";
import { useContacts } from "@/hooks/use-contacts";

const fetchTeamMemberContacts = (teamId: string) =>
  getTeamMemberContacts({ data: { teamId } });

interface TeamMembersSectionProps {
  canManage: boolean;
  canRemoveLeads: boolean;
  leadCount: number;
  members: ReadonlyArray<TeamMember & { user: User | undefined }>;
  onAddMember: () => void;
  onRemoveMember: (id: string) => void;
  onToggleRole: (memberId: string, currentRole: string) => void;
  teamId: string;
  userId: string;
}

export function TeamMembersSection({
  canManage,
  canRemoveLeads,
  leadCount,
  members,
  onAddMember,
  onRemoveMember,
  onToggleRole,
  teamId,
  userId,
}: TeamMembersSectionProps) {
  const stableOnRemove = useEventCallback((id: string) => onRemoveMember(id));
  // Only those who manage the team get its contacts, in the row menu.
  const { contactFor } = useContacts(
    fetchTeamMemberContacts,
    teamId,
    canManage ? members.map((m) => m.userId) : []
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-7 items-center justify-between">
        <h2 className="text-sm font-medium">Members ({members.length})</h2>
        {canManage ? (
          <Button
            onClick={onAddMember}
            size="sm"
            type="button"
            variant="outline"
          >
            <HugeiconsIcon
              className="size-4"
              icon={PlusSignIcon}
              strokeWidth={2}
            />
            Add member
          </Button>
        ) : null}
      </div>

      {members.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {members.map((member) => (
            <MemberRow
              canManage={canManage}
              canRemove={
                canRemoveLeads || (canManage && member.role !== "lead")
              }
              contact={
                member.userId === userId ? undefined : contactFor(member.userId)
              }
              isSoleLeadSelf={
                leadCount === 1 &&
                member.role === "lead" &&
                member.userId === userId
              }
              key={member.id}
              member={member}
              onRemove={stableOnRemove}
              onToggleRole={onToggleRole}
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed py-6 text-center text-sm">
          No members yet.
        </p>
      )}
    </div>
  );
}
