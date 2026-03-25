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
import { computeRequestStats } from "@/components/requests/request-stats";
import { RequestsTable } from "@/components/requests/requests-table";
import { StatsCards } from "@/components/stats/stats-cards";
import { deleteUploadedAssets } from "@/functions/attachments";
import { useZeroQueryStatus } from "@/hooks/use-zero-query";
import {
  normalizeToRequestRows,
  REQUEST_TYPE_LABELS,
  type RequestRow,
} from "@/lib/request-types";

const STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

const TYPE_OPTIONS = [
  { label: "Reimbursement", value: "reimbursement" },
  { label: "Advance Payment", value: "advance_payment" },
  { label: "Vendor Payment", value: "vendor_payment" },
];

export const Route = createFileRoute("/_app/requests/")({
  head: () => ({
    meta: [{ title: `Requests | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context }) => {
    context.zero?.run(queries.reimbursement.all());
    context.zero?.run(queries.advancePayment.all());
    context.zero?.run(queries.vendorPayment.all());
  },
  component: RequestsRouteComponent,
});

function fetchRequestItem(zero: ReturnType<typeof useZero>, row: RequestRow) {
  if (row.type === "reimbursement") {
    return zero.run(queries.reimbursement.byId({ id: row.id }));
  }
  if (row.type === "advance_payment") {
    return zero.run(queries.advancePayment.byId({ id: row.id }));
  }
  return zero.run(queries.vendorPayment.byId({ id: row.id }));
}

function getMutatorNs(type: RequestRow["type"]) {
  if (type === "reimbursement") {
    return mutators.reimbursement;
  }
  if (type === "advance_payment") {
    return mutators.advancePayment;
  }
  return mutators.vendorPayment;
}

function RequestsRouteComponent() {
  const navigate = useNavigate();
  const zero = useZero();

  const [reimbursements, r1] = useQuery(queries.reimbursement.all());
  const [advancePayments, r2] = useQuery(queries.advancePayment.all());
  const [vendorPayments, r3] = useQuery(queries.vendorPayment.all());
  const isLoading1 = useZeroQueryStatus(r1);
  const isLoading2 = useZeroQueryStatus(r2);
  const isLoading3 = useZeroQueryStatus(r3);
  const isLoading = isLoading1 || isLoading2 || isLoading3;

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
    advancePayments ?? [],
    vendorPayments ?? []
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
        component: "RequestsIndex",
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
      <h1 className="font-semibold text-2xl">Requests</h1>

      <div className="fade-in-0 mt-4 grid animate-in gap-6 fill-mode-backwards duration-200 *:min-w-0">
        <StatsCards
          isLoading={isLoading}
          items={computeRequestStats(allData)}
        />
        <RequestsTable
          data={filteredData}
          isLoading={isLoading}
          onDelete={handleDelete}
          onNavigate={(id) => {
            navigate({ to: "/requests/$id", params: { id } });
          }}
          toolbarActions={
            <Button
              onClick={() => {
                navigate({ to: "/requests/new" });
              }}
              size="sm"
              type="button"
            >
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Add request
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
