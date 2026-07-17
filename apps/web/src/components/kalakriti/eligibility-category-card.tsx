import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { AgeCategoryFormValue } from "./age-category-form-dialog";
import type { CenterAgeQuotaSelection } from "./center-age-quota-dialog";

export interface EligibilityCenter {
  id: string;
  name: string;
}

export interface EligibilityQuota {
  ageCategoryId: string;
  centerId: string;
  femaleStudentLimit: number;
  id: string;
  maleStudentLimit: number;
}

interface QuotaCellProps {
  category: AgeCategoryFormValue;
  center: EligibilityCenter;
  configurationLocked: boolean;
  onEdit: (selection: CenterAgeQuotaSelection) => void;
  onRemove: (quota: EligibilityQuota) => void;
  quota: EligibilityQuota | undefined;
}

function QuotaCell({
  category,
  center,
  configurationLocked,
  onEdit,
  onRemove,
  quota,
}: QuotaCellProps) {
  const handleEdit = useEventCallback(() =>
    onEdit({
      ageCategoryId: category.id,
      ageCategoryName: category.name,
      centerId: center.id,
      centerName: center.name,
      femaleStudentLimit: quota ? quota.femaleStudentLimit : null,
      maleStudentLimit: quota ? quota.maleStudentLimit : null,
      quotaId: quota ? quota.id : null,
    })
  );
  const handleRemove = useEventCallback(() => {
    if (quota) {
      onRemove(quota);
    }
  });
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border p-3">
      <div>
        <p className="font-medium text-sm">{center.name}</p>
        <p className="text-muted-foreground text-xs">
          {quota
            ? `Male ${quota.maleStudentLimit} · Female ${quota.femaleStudentLimit}`
            : "Quota not configured"}
        </p>
      </div>
      {configurationLocked ? null : (
        <div className="flex gap-1">
          <Button onClick={handleEdit} size="sm" variant="outline">
            {quota ? "Edit" : "Set quota"}
          </Button>
          {quota ? (
            <Button onClick={handleRemove} size="sm" variant="ghost">
              Remove
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function EligibilityCategoryCard({
  category,
  centers,
  configurationLocked,
  onDelete,
  onEdit,
  onEditQuota,
  onRemoveQuota,
  quotas,
}: {
  category: AgeCategoryFormValue;
  centers: readonly EligibilityCenter[];
  configurationLocked: boolean;
  onDelete: (category: AgeCategoryFormValue) => void;
  onEdit: (category: AgeCategoryFormValue) => void;
  onEditQuota: (selection: CenterAgeQuotaSelection) => void;
  onRemoveQuota: (quota: EligibilityQuota) => void;
  quotas: readonly EligibilityQuota[];
}) {
  const handleDelete = useEventCallback(() => onDelete(category));
  const handleEdit = useEventCallback(() => onEdit(category));
  return (
    <Card aria-label={`${category.name} Age Category`}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{category.name}</CardTitle>
            <Badge variant="outline">
              Ages {category.minimumAge}-{category.maximumAge}
            </Badge>
          </div>
          <CardDescription className="mt-2">
            Up to {category.maxTotalCompetitions} Competitions, with{" "}
            {category.maxCompetitionsPerCategory} from one category.
          </CardDescription>
        </div>
        {configurationLocked ? null : (
          <div className="flex gap-2">
            <Button onClick={handleEdit} size="sm" variant="outline">
              Edit
            </Button>
            <Button onClick={handleDelete} size="sm" variant="ghost">
              Delete
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <h3 className="font-medium text-sm">Center Student limits</h3>
        {centers.length === 0 ? (
          <p className="mt-2 text-muted-foreground text-sm">
            Add Centers before configuring quotas.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {centers.map((center) => (
              <QuotaCell
                category={category}
                center={center}
                configurationLocked={configurationLocked}
                key={center.id}
                onEdit={onEditQuota}
                onRemove={onRemoveQuota}
                quota={quotas.find(
                  (candidate) =>
                    candidate.centerId === center.id &&
                    candidate.ageCategoryId === category.id
                )}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
