import { Badge } from "@pi-dash/design-system/components/reui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@pi-dash/design-system/components/ui/sheet";
import type { User } from "@pi-dash/zero/schema";
import { format } from "date-fns";
import capitalize from "lodash/capitalize";
import { UserAvatar } from "@/components/shared/user-avatar";
import { SHORT_DATE } from "@/lib/date-formats";

interface UserDetailSheetProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  user: User | null;
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value ?? "\u2014"}</span>
    </div>
  );
}

export function UserDetailSheet({
  onOpenChange,
  open,
  user,
}: UserDetailSheetProps) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        {user && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <UserAvatar className="size-10" user={user} />
                <div>
                  <SheetTitle>{user.name}</SheetTitle>
                  <p className="text-muted-foreground text-sm">{user.email}</p>
                </div>
              </div>
            </SheetHeader>

            <div className="flex flex-col gap-6 px-6 pb-6">
              <div className="flex gap-2">
                <Badge variant={user.isActive ? "success-light" : "secondary"}>
                  {user.isActive ? "Active" : "Inactive"}
                </Badge>
                {user.banned && (
                  <Badge variant="destructive-light">Banned</Badge>
                )}
              </div>

              <div className="grid gap-4">
                <h3 className="font-medium text-sm">Profile</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow label="Phone" value={user.phone} />
                  <DetailRow
                    label="Gender"
                    value={user.gender ? capitalize(user.gender) : null}
                  />
                  <DetailRow
                    label="Date of Birth"
                    value={
                      user.dob ? format(new Date(user.dob), SHORT_DATE) : null
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4">
                <h3 className="font-medium text-sm">Role</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow
                    label="Role"
                    value={capitalize(user.role ?? "volunteer")}
                  />
                </div>
              </div>

              {user.banned && (
                <div className="grid gap-4">
                  <h3 className="font-medium text-sm">Ban Details</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailRow label="Reason" value={user.banReason} />
                    <DetailRow
                      label="Expires"
                      value={
                        user.banExpires
                          ? format(new Date(user.banExpires), SHORT_DATE)
                          : "Never"
                      }
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-4">
                <h3 className="font-medium text-sm">Dates</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow
                    label="Joined"
                    value={
                      user.createdAt
                        ? format(new Date(user.createdAt), SHORT_DATE)
                        : null
                    }
                  />
                  <DetailRow
                    label="Last Updated"
                    value={
                      user.updatedAt
                        ? format(new Date(user.updatedAt), SHORT_DATE)
                        : null
                    }
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
