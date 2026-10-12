import type { User } from "@pi-dash/zero/schema";
import { format } from "date-fns";
import capitalize from "lodash/capitalize";
import type { ReactNode } from "react";

import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { StatusBadge } from "@/components/shared/status-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { DATE } from "@/lib/date-formats";

interface UserDetailSheetProps {
  /** Header buttons and ⋯ menu; the table supplies the row menu's actions. */
  actions?: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  user: User | null;
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export function UserDetailSheet({
  actions,
  onOpenChange,
  open,
  user,
}: UserDetailSheetProps) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        {user ? (
          <>
            <DetailSheetHeader
              actions={actions}
              badge={
                <>
                  <StatusBadge tone={user.isActive ? "success" : "neutral"}>
                    {user.isActive ? "Active" : "Inactive"}
                  </StatusBadge>
                  {user.banned ? (
                    <StatusBadge tone="danger">Banned</StatusBadge>
                  ) : null}
                </>
              }
              description={user.email}
              leading={<UserAvatar className="size-10" user={user} />}
              title={user.name}
            />

            <div className="flex flex-col gap-6 px-6 pb-6">
              <div className="grid gap-4">
                <h3 className="text-sm font-medium">Profile</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow label="Phone" value={user.phone} />
                  <DetailRow label="Group" value={user.registrationGroup} />
                  <DetailRow
                    label="Gender"
                    value={user.gender ? capitalize(user.gender) : null}
                  />
                  <DetailRow
                    label="Date of Birth"
                    value={user.dob ? format(new Date(user.dob), DATE) : null}
                  />
                </div>
              </div>

              <div className="grid gap-4">
                <h3 className="text-sm font-medium">Role</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow
                    label="Role"
                    value={user.role ? capitalize(user.role) : null}
                  />
                </div>
              </div>

              {Boolean(user.banned) && (
                <div className="grid gap-4">
                  <h3 className="text-sm font-medium">Ban Details</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailRow label="Reason" value={user.banReason} />
                    <DetailRow
                      label="Expires"
                      value={
                        user.banExpires
                          ? format(new Date(user.banExpires), DATE)
                          : "Never"
                      }
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-4">
                <h3 className="text-sm font-medium">Dates</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow
                    label="Joined"
                    value={
                      user.createdAt
                        ? format(new Date(user.createdAt), DATE)
                        : null
                    }
                  />
                  <DetailRow
                    label="Last updated"
                    value={
                      user.updatedAt
                        ? format(new Date(user.updatedAt), DATE)
                        : null
                    }
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          <DetailSheetHeader title="User" />
        )}
      </SheetContent>
    </Sheet>
  );
}
