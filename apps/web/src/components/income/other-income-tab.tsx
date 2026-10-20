import { MoneyAdd01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { lazy, Suspense, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { NotFoundState } from "@/components/shared/not-found-state";
import { PendingDialog } from "@/components/shared/pending-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";

import type { OtherIncomeRow } from "./income-types";
import { OtherIncomeTable } from "./other-income-table";

const loadOtherIncomeFormDialog = () => import("./other-income-form-dialog");
const OtherIncomeFormDialog = lazy(() =>
  loadOtherIncomeFormDialog().then((module) => ({
    default: module.OtherIncomeFormDialog,
  }))
);

export function OtherIncomeTab({
  canManage,
  onRecord,
}: {
  canManage: boolean;
  onRecord: () => void;
}) {
  const zero = useZero();
  const [incomes, result] = useQuery(queries.otherIncome.list());
  const rows = incomes as OtherIncomeRow[];
  const isLoading = rows.length === 0 && result.type !== "complete";
  const [editing, setEditing] = useState<OtherIncomeRow | null>(null);
  const deleteAction = useConfirmAction<OtherIncomeRow>({
    mutationMeta: {
      entityId: (row) => row.id,
      errorMsg: "Couldn't delete income",
      mutation: "otherIncome.delete",
      successMsg: "Income deleted",
    },
    onConfirm: async (row) =>
      await zero.mutate(mutators.otherIncome.delete({ id: row.id })).server,
  });
  const handleEdit = useEventCallback((row: OtherIncomeRow) => setEditing(row));
  const handleDelete = useEventCallback((row: OtherIncomeRow) =>
    deleteAction.trigger(row)
  );
  const handleEditOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setEditing(null);
    }
  });

  if (!isLoading && rows.length === 0) {
    return (
      <NotFoundState
        actions={
          canManage ? (
            <Button onClick={onRecord} type="button">
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Record other income
            </Button>
          ) : null
        }
        description="Bank interest, returned grants and other money that is not a donation. It never enters donation filings."
        icon={MoneyAdd01Icon}
        title="No other income yet"
      />
    );
  }

  return (
    <>
      <OtherIncomeTable
        canManage={canManage}
        data={rows}
        isLoading={isLoading}
        onDelete={handleDelete}
        onEdit={handleEdit}
      />
      {editing ? (
        <Suspense
          fallback={
            <PendingDialog
              description="Loading income details"
              title="Edit other income"
              onOpenChange={handleEditOpenChange}
            />
          }
        >
          <OtherIncomeFormDialog
            income={editing}
            onOpenChange={handleEditOpenChange}
            open
          />
        </Suspense>
      ) : null}
      <ConfirmDialog
        confirmLabel="Delete income"
        description="This cannot be undone."
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={(open) => {
          if (!open) {
            deleteAction.cancel();
          }
        }}
        open={deleteAction.isOpen}
        title="Delete this income?"
        variant="destructive"
      />
    </>
  );
}
