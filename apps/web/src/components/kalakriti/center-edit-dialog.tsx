import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";

import { CenterEditAssignments } from "./center-edit-assignments";
import { CenterDetailsForm } from "./center-form-dialog";
import { CenterRegistrationForm } from "./center-registration-dialog";
import type { CenterListItem } from "./centers-table";

export function CenterEditDialog({
  center,
  editionId,
  lifecycle,
  canEditDetails,
  canManageGuardians,
  canManageLiaisons,
  canManageRegistrationControls,
  open,
  onOpenChange,
}: {
  center: CenterListItem;
  editionId: string;
  lifecycle: string;
  canEditDetails: boolean;
  canManageGuardians: boolean;
  canManageLiaisons: boolean;
  canManageRegistrationControls: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit Center</DialogTitle>
          <DialogDescription>
            Each section saves independently. Guardian and Liaison assignment
            changes take effect immediately. Transport details are managed on
            the Transport page.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <div className="space-y-6" key={center.id}>
            <section className="space-y-4">
              <h3 className="font-medium">Basic details</h3>
              {canEditDetails ? (
                <CenterDetailsForm
                  center={center}
                  editionId={editionId}
                  onOpenChange={onOpenChange}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  {center.name}
                  {center.location ? ` · ${center.location}` : ""}. Only Center
                  administrators can edit basic details.
                </p>
              )}
            </section>
            <section className="space-y-4 border-t pt-4">
              <h3 className="font-medium">Registration controls</h3>
              {canManageRegistrationControls && center.retiredAt === null ? (
                <CenterRegistrationForm
                  center={center}
                  onOpenChange={onOpenChange}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  Student registration:{" "}
                  {center.studentRegistrationEnabled ? "Open" : "Closed"}. Event
                  participation registration:{" "}
                  {center.competitionEntryRegistrationEnabled
                    ? "Open"
                    : "Closed"}
                  . Registration controls are read-only.
                </p>
              )}
            </section>
            {canManageGuardians || canManageLiaisons ? (
              <section className="space-y-4 border-t pt-4">
                <h3 className="font-medium">Assignments</h3>
                {lifecycle === "archived" ? (
                  <p className="text-muted-foreground text-sm">
                    Assignments are read-only in archived Editions.
                  </p>
                ) : null}
                <CenterEditAssignments
                  centerId={center.id}
                  editionId={editionId}
                  archived={lifecycle === "archived"}
                  retired={center.retiredAt !== null}
                  canManageGuardians={canManageGuardians}
                  canManageLiaisons={canManageLiaisons}
                />
              </section>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
