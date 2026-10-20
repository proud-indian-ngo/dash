import { MinusSignIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@pi-dash/design-system/components/ui/card";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";

import { COLUMN_ICONS } from "@/components/data-table/column-icons";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import {
  optionsFromRows,
  selectField,
} from "@/components/data-table/filter-fields";

import {
  type EligibleFoodRow,
  useEligibleFoodRoster,
} from "./food-roster-snapshot";

export interface FoodTableRow {
  id: string;
  name: string;
  humanId: string | null;
  kind: "student" | "volunteer" | "guardian" | "guest" | "judge";
  state?: "active" | "archived";
  centers: readonly { id: string; name: string }[];
  operations: readonly {
    id?: string;
    type: string;
    supersededByOperationId: string | null;
  }[];
}
const ROLE_LABELS = {
  student: "Student",
  volunteer: "Volunteer",
  guardian: "Guardian",
  guest: "Guest",
  judge: "Judge",
};
const UNASSIGNED_CENTER = "unassigned";
const MEAL_OPTIONS = ["Served", "Not served"].map((value) => ({
  value,
  label: value,
}));
export function createFoodFilterFields(
  rows: readonly FoodTableRow[]
): FilterField[] {
  return [
    { id: "name", label: "Name", type: "text", defaultOperator: "contains" },
    {
      id: "humanId",
      label: "Person ID",
      type: "text",
      defaultOperator: "contains",
    },
    selectField(
      "role",
      "Role",
      Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))
    ),
    {
      id: "centers",
      label: "Center",
      type: "multiselect",
      defaultOperator: "has_any_of",
      options: [
        ...optionsFromRows(
          rows.flatMap((row) => row.centers),
          (center) => center.id,
          (center) => center.name
        ),
        ...(rows.some((row) => row.centers.length === 0)
          ? [{ value: UNASSIGNED_CENTER, label: "Unassigned" }]
          : []),
      ],
    },
    selectField("breakfast", "Breakfast", MEAL_OPTIONS),
    selectField("lunch", "Lunch", MEAL_OPTIONS),
  ];
}
export function getFoodFilterValue(
  row: EligibleFoodRow,
  path: string[]
): unknown {
  switch (path[0]) {
    case "name":
      return row.name;
    case "humanId":
      return row.humanId ?? row.id;
    case "role":
      return row.kind;
    case "centers":
      return row.centers.length > 0
        ? row.centers.map((center) => center.id)
        : [UNASSIGNED_CENTER];
    case "breakfast":
      return row.breakfast;
    case "lunch":
      return row.lunch;
    default:
      return undefined;
  }
}
export function foodCenterNames(row: FoodTableRow): string {
  return (
    [...new Map(row.centers.map((center) => [center.id, center.name])).values()]
      .sort((a, b) => a.localeCompare(b))
      .join(", ") || "Unassigned"
  );
}
function getFoodRowId(row: FoodTableRow): string {
  return `${row.kind}:${row.id}`;
}
function searchFood(row: FoodTableRow, query: string): boolean {
  return [
    row.name,
    row.humanId,
    row.id,
    ROLE_LABELS[row.kind],
    foodCenterNames(row),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}
export function FoodMealStatus({
  label,
}: {
  label: EligibleFoodRow["breakfast"];
}) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={
        label === "Served"
          ? "text-success-foreground inline-flex"
          : "text-muted-foreground inline-flex"
      }
    >
      <HugeiconsIcon
        aria-hidden="true"
        icon={label === "Served" ? Tick02Icon : MinusSignIcon}
        className="size-5"
        strokeWidth={2}
      />
    </span>
  );
}
const skeleton = <Skeleton className="h-5 w-28" />;
const EMPTY_ROWS: EligibleFoodRow[] = [];
export interface FoodMealUndoTarget {
  personName: string;
  meal: "breakfast" | "lunch";
  targetOperationId: string;
}
function effectiveMealId(row: FoodTableRow, meal: "breakfast" | "lunch") {
  return row.operations.find(
    (operation) =>
      operation.type === meal && operation.supersededByOperationId === null
  )?.id;
}
export function FoodTable({
  data,
  isLoading,
  statusSnapshotComplete,
  statusSnapshotKey,
  onUndoMeal,
  undoDisabled = true,
}: {
  data: FoodTableRow[];
  isLoading: boolean;
  statusSnapshotComplete: boolean;
  statusSnapshotKey: string;
  onUndoMeal?: (target: FoodMealUndoTarget) => void;
  undoDisabled?: boolean;
}) {
  const snapshot = useEligibleFoodRoster(
    data,
    statusSnapshotKey,
    statusSnapshotComplete
  );
  if (!snapshot && (isLoading || !statusSnapshotComplete)) {
    return (
      <Card
        aria-busy="true"
        aria-label="Loading Food roster"
        className="h-[13.625rem] w-full gap-0 py-0!"
        role="status"
      >
        <CardHeader className="block border-b px-3 py-2.5">
          <Skeleton className="h-8 w-full max-w-64" />
        </CardHeader>
        <CardContent className="flex flex-1 px-3 py-4">
          <div className="flex h-fit w-full items-center gap-3 rounded-lg border p-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-5 w-16" />
          </div>
        </CardContent>
      </Card>
    );
  }
  const rows = snapshot?.rows ?? EMPTY_ROWS;
  const fields = createFoodFilterFields(rows);
  const columns: DataGridColumnDef<EligibleFoodRow>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Name" visibility={true} />
      ),
      cell: ({ row }) => (
        <span className="font-medium" data-testid="row-title">
          {row.original.name}
        </span>
      ),
      meta: {
        compact: "primary",
        headerTitle: "Name",
        kind: "text",
        skeleton,
      },
      size: 220,
    },
    {
      id: "humanId",
      accessorFn: (row) => row.humanId ?? row.id,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Person ID"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Person ID", kind: "id", skeleton },
      size: 220,
    },
    {
      id: "role",
      accessorFn: (row) => ROLE_LABELS[row.kind],
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Role" visibility={true} />
      ),
      meta: {
        compact: "primary",
        headerTitle: "Role",
        icon: COLUMN_ICONS.role,
        kind: "tag",
        skeleton,
      },
      size: 130,
    },
    {
      id: "centers",
      accessorFn: foodCenterNames,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Center"
          visibility={true}
        />
      ),
      meta: {
        headerTitle: "Center",
        icon: COLUMN_ICONS.center,
        kind: "text",
        skeleton,
      },
      size: 240,
    },
    ...(
      [
        ["breakfast", "Breakfast"],
        ["lunch", "Lunch"],
      ] as const
    ).map(([id, title]): DataGridColumnDef<EligibleFoodRow> => ({
      id,
      accessorFn: (row) => row[id],
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title={title} visibility={true} />
      ),
      cell: ({ row }) => {
        const targetOperationId = effectiveMealId(row.original, id);
        return onUndoMeal &&
          row.original[id] === "Served" &&
          targetOperationId ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={undoDisabled}
            aria-label={`Undo ${id} for ${row.original.name}`}
            onClick={() =>
              onUndoMeal({
                personName: row.original.name,
                meal: id,
                targetOperationId,
              })
            }
          >
            <FoodMealStatus label={row.original[id]} />
          </Button>
        ) : (
          <FoodMealStatus label={row.original[id]} />
        );
      },
      meta: { compact: "trailing", headerTitle: title, skeleton },
      size: 170,
    })),
  ];
  return (
    <DataTableWrapper
      columns={columns}
      data={rows}
      emptyMessage="No eligible people in your Food scope."
      compactOnMobile
      filter={{ fields, getValue: getFoodFilterValue }}
      getRowId={getFoodRowId}
      searchFn={searchFood}
      searchPlaceholder="Search people..."
      storageKey="kalakriti_food_table_state_v1"
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
    />
  );
}
