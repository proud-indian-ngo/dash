import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { log } from "evlog";
import { parseAsString, useQueryState } from "nuqs";
import { toast } from "sonner";
import { TableFilterSelect } from "@/components/data-table/table-filter-select";
import { computeReimbursementStats } from "@/components/reimbursements/reimbursement-stats";
import { ReimbursementsTable } from "@/components/reimbursements/reimbursements-table";
import { StatsCards } from "@/components/stats/stats-cards";
import { deleteUploadedAssets } from "@/functions/attachments";
import {
  normalizeToRequestRows,
  REQUEST_TYPE_LABELS,
  type RequestRow,
} from "@/lib/reimbursement-types";

const STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

const TYPE_OPTIONS = [
  { label: "Reimbursement", value: "reimbursement" },
  { label: "Advance Payment", value: "advance_payment" },
];

export const Route = createFileRoute("/_app/reimbursements/")({
  head: () => ({
    meta: [{ title: `Reimbursements | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context }) => {
    context.zero?.preload(queries.reimbursement.all());
    context.zero?.preload(queries.advancePayment.all());
  },
  component: ReimbursementsRouteComponent,
});

function fetchRequestItem(zero: ReturnType<typeof useZero>, row: RequestRow) {
  if (row.type === "reimbursement") {
    return zero.run(queries.reimbursement.byId({ id: row.id }));
  }
  return zero.run(queries.advancePayment.byId({ id: row.id }));
}

function getMutatorNs(type: RequestRow["type"]) {
  if (type === "reimbursement") {
    return mutators.reimbursement;
  }
  return mutators.advancePayment;
}

function ReimbursementsRouteComponent() {
  const navigate = useNavigate();
  const zero = useZero();

  const [reimbursements, r1] = useQuery(queries.reimbursement.all());
  const [advancePayments, r2] = useQuery(queries.advancePayment.all());
  const isLoading =
    reimbursements.length === 0 &&
    advancePayments.length === 0 &&
    r1.type !== "complete" &&
    r2.type !== "complete";

  const [statusFilter, setStatusFilter] = useQueryState(
    "status",
    parseAsString.withDefault("")
  );
  const [typeFilter, setTypeFilter] = useQueryState(
    "type",
    parseAsString.withDefault("")
  );

  const allData = normalizeToRequestRows(
    reimbursements ?? [],
    advancePayments ?? []
  );

  const filteredData = (() => {
    let result = allData;
    if (statusFilter) {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (typeFilter) {
      result = result.filter((r) => r.type === typeFilter);
    }
    return result;
  })();

  const handleDelete = async (row: RequestRow) => {
    const typeLabel = REQUEST_TYPE_LABELS[row.type].toLowerCase();
    try {
      const item = await fetchRequestItem(zero, row);
      const r2Keys =
        item?.attachments
          ?.filter((a) => a.type === "file" && a.objectKey)
          .map((a) => a.objectKey as string) ?? [];

      if (r2Keys.length > 0) {
        await deleteUploadedAssets({
          data: { keys: r2Keys, subfolder: "attachments" },
        });
      }

      const mutatorNs = getMutatorNs(row.type);
      await zero.mutate(mutatorNs.delete({ id: row.id }));
      toast.success(`${REQUEST_TYPE_LABELS[row.type]} deleted`);
    } catch (error) {
      log.error({
        component: "ReimbursementsIndex",
        action: "delete",
        requestId: row.id,
        type: row.type,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(`Failed to delete ${typeLabel}`);
    }
  };

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        Reimbursements
      </h1>

      <div className="mt-4 grid gap-6 *:min-w-0">
        <StatsCards
          isLoading={isLoading}
          items={computeReimbursementStats(allData)}
        />
        <ReimbursementsTable
          data={filteredData}
          hasActiveFilters={!!(statusFilter || typeFilter)}
          isLoading={isLoading}
          onClearFilters={() => {
            setStatusFilter("");
            setTypeFilter("");
          }}
          onDelete={handleDelete}
          onNavigate={(id) => {
            navigate({ to: "/reimbursements/$id", params: { id } });
          }}
          toolbarActions={
            <Button
              onClick={() => {
                navigate({ to: "/reimbursements/new" });
              }}
              size="sm"
              type="button"
            >
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Add reimbursement
            </Button>
          }
          toolbarFilters={
            <>
              <TableFilterSelect
                label="Type"
                onChange={setTypeFilter}
                options={TYPE_OPTIONS}
                value={typeFilter}
              />
              <TableFilterSelect
                label="Status"
                onChange={setStatusFilter}
                options={STATUS_OPTIONS}
                value={statusFilter}
              />
            </>
          }
        />
      </div>
    </div>
  );
}
