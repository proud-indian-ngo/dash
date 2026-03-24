import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import type { TeamMember, User } from "@pi-dash/zero/schema";
import { MemberRow } from "@/components/teams/team-member-row";

interface TeamMembersSectionProps {
  canManage: boolean;
  isAdmin: boolean;
  leadCount: number;
  members: ReadonlyArray<TeamMember & { user: User | undefined }>;
  onAddMember: () => void;
  onRemoveMember: (id: string) => void;
  onToggleRole: (memberId: string, currentRole: string) => void;
  userId: string;
}

export function TeamMembersSection({
  canManage,
  isAdmin,
  leadCount,
  members,
  onAddMember,
  onRemoveMember,
  onToggleRole,
  userId,
}: TeamMembersSectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-sm">Members ({members.length})</h2>
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
            Add Member
          </Button>
        ) : null}
      </div>

      {members.length > 0 ? (
        <div className="overflow-hidden rounded-md border">
          {members.map((member) => (
            <MemberRow
              canManage={canManage}
              canRemove={isAdmin || (canManage && member.role !== "lead")}
              isSoleLeadSelf={
                leadCount === 1 &&
                member.role === "lead" &&
                member.userId === userId
              }
              key={member.id}
              member={member}
              onRemove={(id) => onRemoveMember(id)}
              onToggleRole={onToggleRole}
            />
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground text-sm">
          No members yet.
        </p>
      )}
    </div>
  );
}
