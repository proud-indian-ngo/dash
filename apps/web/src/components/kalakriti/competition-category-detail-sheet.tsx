import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@pi-dash/design-system/components/ui/sheet";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
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
        <SheetHeader>
          <SheetTitle>{category.name}</SheetTitle>
          <SheetDescription>
            Competition grouping, display order, and lifecycle details.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-6 pb-6">
          <Badge
            className="w-fit"
            variant={category.retiredAt === null ? "secondary" : "outline"}
          >
            {category.retiredAt === null ? "Active" : "Retired"}
          </Badge>

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

          {canManage ? (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button onClick={handleEdit}>Edit Category</Button>
              <Button onClick={handleRetire} variant="outline">
                {category.retiredAt === null ? "Retire" : "Restore"}
              </Button>
              <Button onClick={handleDelete} variant="destructive">
                Delete
              </Button>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
