import {
  Delete02Icon,
  Edit02Icon,
  PlusSignIcon,
  UserRemoveIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { formatEnumLabel } from "@pi-dash/shared/constants";
import { mutators } from "@pi-dash/zero/mutators";
import type {
  Center,
  CenterCoordinator,
  Student,
  User,
} from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { AddCoordinatorDialog } from "@/components/centers/add-coordinator-dialog";
import { CenterFormDialog } from "@/components/centers/center-form-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { UserHoverCard } from "@/components/shared/user-hover-card";
import { useApp } from "@/context/app-context";
import { useConfirmAction } from "@/hooks/use-confirm-action";

export type CenterDetailData = Center & {
  coordinators: readonly (CenterCoordinator & { user: User | undefined })[];
  students: readonly Student[];
};

interface CenterDetailProps {
  center: CenterDetailData;
}

type CenterDialog = { type: "edit" } | { type: "addCoordinator" };

function CenterHeaderActions({
  canDelete,
  canEdit,
  onDelete,
  onEdit,
}: {
  canDelete: boolean;
  canEdit: boolean;
  onDelete: () => void;
  onEdit: () => void;
}) {
  if (!(canEdit || canDelete)) {
    return null;
  }
  return (
    <div className="flex gap-2">
      {canEdit ? (
        <Button onClick={onEdit} size="sm" type="button" variant="outline">
          <HugeiconsIcon className="size-4" icon={Edit02Icon} strokeWidth={2} />
          Edit
        </Button>
      ) : null}
      {canDelete ? (
        <Button
          onClick={onDelete}
          size="sm"
          type="button"
          variant="destructive"
        >
          <HugeiconsIcon
            className="size-4"
            icon={Delete02Icon}
            strokeWidth={2}
          />
          Delete
        </Button>
      ) : null}
    </div>
  );
}

export function CenterDetail({ center }: CenterDetailProps) {
  const zero = useZero();
  const navigate = useNavigate();
  const { hasPermission } = useApp();
  const canEdit = hasPermission("centers.manage");
  const canDelete = hasPermission("centers.manage");
  const canManage = hasPermission("centers.manage");

  const [dialogState, setDialogState] = useState<CenterDialog | null>(null);

  const deleteCenter = useConfirmAction({
    onConfirm: () =>
      zero.mutate(mutators.center.delete({ id: center.id })).server,
    onSuccess: () => {
      toast.success("Center deleted");
      navigate({ to: "/centers" });
    },
    onError: (msg) => {
      log.error({
        component: "CenterDetail",
        mutation: "center.delete",
        entityId: center.id,
        error: msg ?? "unknown",
      });
      toast.error("Failed to delete center");
    },
  });

  const removeCoordinator = useConfirmAction<string>({
    onConfirm: (coordinatorId) =>
      zero.mutate(
        mutators.center.removeCoordinator({
          id: coordinatorId,
        })
      ).server,
    onSuccess: () => toast.success("Coordinator removed"),
    onError: (msg) => {
      log.error({
        component: "CenterDetail",
        mutation: "center.removeCoordinator",
        entityId: center.id,
        error: msg ?? "unknown",
      });
      toast.error("Failed to remove coordinator");
    },
  });

  const handleOpenDialog = (dialog: CenterDialog) => {
    setDialogState(dialog);
  };

  const handleCloseDialog = () => {
    setDialogState(null);
  };

  return (
    <AppErrorBoundary level="section">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="font-display font-semibold text-2xl tracking-tight">
              {center.name}
            </h1>
            {center.city ? (
              <p className="text-muted-foreground text-sm">
                {formatEnumLabel(center.city)}
              </p>
            ) : null}
            {center.address ? (
              <p className="text-muted-foreground text-sm">{center.address}</p>
            ) : null}
          </div>
          <CenterHeaderActions
            canDelete={canDelete}
            canEdit={canEdit}
            onDelete={() => deleteCenter.trigger()}
            onEdit={() => handleOpenDialog({ type: "edit" })}
          />
        </div>

        <Separator />

        {/* Coordinators */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-sm">
              Coordinators ({center.coordinators.length})
            </h2>
            {canManage ? (
              <Button
                onClick={() => handleOpenDialog({ type: "addCoordinator" })}
                size="sm"
                type="button"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={PlusSignIcon}
                  strokeWidth={2}
                />
                Add Coordinator
              </Button>
            ) : null}
          </div>

          {center.coordinators.length > 0 ? (
            <div className="overflow-hidden rounded-md border">
              {center.coordinators.map((coordinator) => (
                <div
                  className="flex items-center justify-between border-b px-3 py-2.5 last:border-0"
                  key={coordinator.id}
                >
                  {coordinator.user ? (
                    <UserHoverCard
                      triggerClassName="flex cursor-pointer items-center gap-3 [@media(pointer:coarse)]:pointer-events-none"
                      user={coordinator.user}
                    >
                      <UserAvatar className="size-8" user={coordinator.user} />
                      <div>
                        <div className="font-medium text-sm">
                          {coordinator.user.name}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {coordinator.user.email}
                        </div>
                      </div>
                    </UserHoverCard>
                  ) : (
                    <div className="flex items-center gap-3">
                      <UserAvatar className="size-8" user={{ name: "?" }} />
                      <div>
                        <div className="font-medium text-sm">Unknown user</div>
                      </div>
                    </div>
                  )}
                  {canManage ? (
                    <Button
                      aria-label={`Remove ${coordinator.user?.name ?? "coordinator"}`}
                      className="size-8"
                      onClick={() => removeCoordinator.trigger(coordinator.id)}
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
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground text-sm">
              No coordinators yet.
            </p>
          )}
        </div>

        <Separator />

        {/* Students */}
        <div className="flex flex-col gap-3">
          <h2 className="font-medium text-sm">
            Students ({center.students.length})
          </h2>
          {center.students.length > 0 ? (
            <p className="text-muted-foreground text-sm">
              Student management is handled separately.
            </p>
          ) : (
            <p className="text-center text-muted-foreground text-sm">
              No students yet.
            </p>
          )}
        </div>

        {/* Edit Center Dialog */}
        {canEdit ? (
          <CenterFormDialog
            initialValues={{
              id: center.id,
              name: center.name,
              city: center.city,
              address: center.address,
            }}
            onOpenChange={(open) => {
              if (!open) {
                handleCloseDialog();
              }
            }}
            open={dialogState?.type === "edit"}
          />
        ) : null}

        {/* Add Coordinator Dialog */}
        {canManage ? (
          <AddCoordinatorDialog
            centerId={center.id}
            existingCoordinators={center.coordinators}
            onOpenChange={(open) => {
              if (!open) {
                handleCloseDialog();
              }
            }}
            open={dialogState?.type === "addCoordinator"}
          />
        ) : null}

        {/* Delete Center Confirmation */}
        <ConfirmDialog
          confirmLabel="Delete"
          description={`This will permanently delete "${center.name}". This action cannot be undone.`}
          loading={deleteCenter.isLoading}
          loadingLabel="Deleting..."
          onConfirm={deleteCenter.confirm}
          onOpenChange={(open) => {
            if (!open) {
              deleteCenter.cancel();
            }
          }}
          open={deleteCenter.isOpen}
          title="Delete center"
        />

        {/* Remove Coordinator Confirmation */}
        <ConfirmDialog
          confirmLabel="Remove"
          description="Are you sure you want to remove this coordinator from the center?"
          loading={removeCoordinator.isLoading}
          loadingLabel="Removing..."
          onConfirm={removeCoordinator.confirm}
          onOpenChange={(open) => {
            if (!open) {
              removeCoordinator.cancel();
            }
          }}
          open={removeCoordinator.isOpen}
          title="Remove coordinator"
        />
      </div>
    </AppErrorBoundary>
  );
}
