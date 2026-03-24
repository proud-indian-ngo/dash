import { PlusSignIcon, UserRemoveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import type { TeamEventMember, User } from "@pi-dash/zero/schema";
import { format } from "date-fns";
import { UserAvatar } from "@/components/shared/user-avatar";
import { LOCALE_DATE } from "@/lib/date-formats";
import type { EventRow } from "./events-table";

function EventMemberRow({
  canManage,
  member,
  onRemove,
}: {
  canManage: boolean;
  member: TeamEventMember & { user: User | undefined };
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-2">
      {member.user ? (
        <UserAvatar
          className="size-8"
          fallbackClassName="text-xs"
          user={member.user}
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-sm">
          {member.user?.name ?? "Unknown"}
        </div>
        <div className="text-muted-foreground text-xs">
          Added {format(new Date(member.addedAt), LOCALE_DATE)}
        </div>
      </div>
      {canManage ? (
        <Button
          aria-label={`Remove ${member.user?.name ?? "volunteer"}`}
          onClick={() => onRemove(member.id)}
          size="icon"
          variant="ghost"
        >
          <HugeiconsIcon className="size-4" icon={UserRemoveIcon} />
        </Button>
      ) : null}
    </div>
  );
}

export function EventMembersSection({
  canManage,
  members,
  onAddMember,
  onRemoveMember,
}: {
  canManage: boolean;
  members: EventRow["members"];
  onAddMember: () => void;
  onRemoveMember: (id: string) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-sm">Volunteers ({members.length})</h2>
        {canManage ? (
          <Button onClick={onAddMember} size="sm" variant="outline">
            <HugeiconsIcon className="size-4" icon={PlusSignIcon} />
            Add Volunteer
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        {members.map((member) => (
          <EventMemberRow
            canManage={canManage}
            key={member.id}
            member={member}
            onRemove={onRemoveMember}
          />
        ))}
        {members.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm">
            No volunteers yet.
          </p>
        ) : null}
      </div>
    </>
  );
}
