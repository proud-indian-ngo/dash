import {
  ArrowTurnBackwardIcon,
  Archive02Icon,
  Delete02Icon,
  Edit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";

import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { PageHeaderMenu } from "@/components/shared/page-header";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { StatusBadge } from "@/components/shared/status-badge";

import type {
  CompetitionCategoryTableRow,
  ConfigurationDeletePayload,
  ConfigurationStatePayload,
} from "./competition-config-types";

export function CompetitionCategoryDetailSheet({
  canManage,
  category,
  onDelete,
  onEdit,
  onOpenChange,
  onSetState,
  open,
}: {
  canManage: boolean;
  category: CompetitionCategoryTableRow | null;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (category: CompetitionCategoryTableRow) => void;
  onOpenChange: (open: boolean) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
  open: boolean;
}) {
  const handleEdit = useEventCallback(() => {
    if (category) {
      onEdit(category);
    }
  });
  const handleRetire = useEventCallback(() => {
    if (category) {
      onSetState({
        action: category.retiredAt === null ? "Retire" : "Restore",
        enabled: category.retiredAt === null,
        id: category.id,
        kind: "category_retired",
        name: category.name,
      });
    }
  });
  const handleDelete = useEventCallback(() => {
    if (category) {
      onDelete({ id: category.id, kind: "category", name: category.name });
    }
  });

  if (!category) {
    return null;
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        <DetailSheetHeader
          actions={
            <>
              {canManage ? (
                <Button onClick={handleEdit} type="button" variant="outline">
                  <HugeiconsIcon
                    className="size-4"
                    icon={Edit02Icon}
                    strokeWidth={2}
                  />
                  Edit
                </Button>
              ) : null}
              <PageHeaderMenu
                actions={[
                  canManage && {
                    icon:
                      category.retiredAt === null
                        ? Archive02Icon
                        : ArrowTurnBackwardIcon,
                    id: "retire",
                    label: category.retiredAt === null ? "Retire" : "Restore",
                    onSelect: handleRetire,
                  },
                  canManage && {
                    destructive: true,
                    icon: Delete02Icon,
                    id: "delete",
                    label: "Delete category",
                    onSelect: handleDelete,
                  },
                ]}
                title={`${category.name} actions`}
              />
            </>
          }
          badge={
            <StatusBadge
              tone={category.retiredAt === null ? "success" : "neutral"}
            >
              {category.retiredAt === null ? "Active" : "Retired"}
            </StatusBadge>
          }
          description="Competition grouping, display order, and lifecycle details."
          title={category.name}
        />

        <div className="flex flex-col gap-6 px-6 pb-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <span className="text-muted-foreground text-xs">
                Display order
              </span>
              <span className="text-sm">{category.sortOrder}</span>
            </div>
            <div className="grid gap-1">
              <span className="text-muted-foreground text-xs">
                Competitions
              </span>
              <span className="text-sm">{category.competitionCount}</span>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
