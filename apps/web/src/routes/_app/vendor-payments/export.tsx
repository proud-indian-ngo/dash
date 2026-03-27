import { Button } from "@pi-dash/design-system/components/ui/button";
import { Checkbox } from "@pi-dash/design-system/components/ui/checkbox";
import { Label } from "@pi-dash/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";
import {
  exportVendorPaymentsCsv,
  type TransactionExportRow,
  type VendorPaymentExportRow,
} from "@/functions/export-vendor-payments-csv";
import { downloadCsv } from "@/lib/csv-export";
import { getErrorMessage } from "@/lib/errors";
import { assertPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/vendor-payments/export")({
  head: () => ({
    meta: [{ title: `Export Vendor Payments | ${env.VITE_APP_NAME}` }],
  }),
  beforeLoad: ({ context }) => assertPermission(context, "requests.export"),
  component: ExportVendorPaymentsRouteComponent,
});

const FY_OPTIONS = (() => {
  const now = new Date();
  const currentFyStart =
    now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: 4 }, (_, i) => {
    const start = currentFyStart - i;
    return {
      label: `FY ${start}-${String(start + 1).slice(2)}`,
      value: start,
    };
  });
})();

const ALL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "partially_paid",
  "paid",
] as const;
type Status = (typeof ALL_STATUSES)[number];

const STATUS_LABELS: Record<Status, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  partially_paid: "Partially Paid",
  paid: "Paid",
};

const VP_HEADERS = [
  "Title",
  "Vendor",
  "Invoice Number",
  "Invoice Date",
  "Created By",
  "Email",
  "Status",
  "Total Amount",
  "Paid Amount",
  "Remaining",
  "Submitted At",
  "Created At",
];

const TX_HEADERS = [
  "Vendor Payment",
  "Amount",
  "Description",
  "Transaction Date",
  "Payment Method",
  "Reference",
  "Status",
  "Recorded By",
];

function vpRowToArray(row: VendorPaymentExportRow): string[] {
  return [
    row.title,
    row.vendorName,
    row.invoiceNumber,
    row.invoiceDate,
    row.createdBy,
    row.email,
    row.status,
    row.totalAmount,
    row.paidAmount,
    row.remaining,
    row.submittedAt,
    row.createdAt,
  ];
}

function txRowToArray(row: TransactionExportRow): string[] {
  return [
    row.vendorPaymentTitle,
    row.amount,
    row.description,
    row.transactionDate,
    row.paymentMethod,
    row.paymentReference,
    row.status,
    row.recordedBy,
  ];
}

function ExportVendorPaymentsRouteComponent() {
  const runExport = useServerFn(exportVendorPaymentsCsv);
  const fyOptions = FY_OPTIONS;

  const [fyStart, setFyStart] = useState(String(fyOptions[0]?.value));
  const [selectedStatuses, setSelectedStatuses] = useState<Set<Status>>(
    new Set(ALL_STATUSES)
  );
  const [includeTransactions, setIncludeTransactions] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const toggleStatus = (status: Status) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const fyStartNum = Number(fyStart);
      const statuses =
        selectedStatuses.size === ALL_STATUSES.length
          ? undefined
          : [...selectedStatuses];
      const result = await runExport({
        data: { fyStart: fyStartNum, statuses, includeTransactions },
      });

      const today = new Date().toISOString().slice(0, 10);

      // Export vendor payments
      downloadCsv(
        `vendor-payments_FY${fyStartNum}-${String(fyStartNum + 1).slice(2)}_${today}.csv`,
        VP_HEADERS,
        result.rows.map(vpRowToArray)
      );

      // Export transactions if included
      if (includeTransactions && result.transactionRows.length > 0) {
        downloadCsv(
          `vendor-payment-transactions_FY${fyStartNum}-${String(fyStartNum + 1).slice(2)}_${today}.csv`,
          TX_HEADERS,
          result.transactionRows.map(txRowToArray)
        );
      }

      const txCount = result.transactionRows.length;
      toast.success(
        `Exported ${result.rows.length} vendor payments${txCount > 0 ? ` and ${txCount} transactions` : ""}`
      );
    } catch (error) {
      log.error({
        component: "ExportVendorPayments",
        action: "exportCsv",
        fyStart,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(getErrorMessage(error));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        Export Vendor Payments
      </h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Export vendor payment data as CSV for a financial year.
      </p>

      <div className="mt-4 grid max-w-md gap-6">
        <fieldset className="grid gap-3">
          <legend className="font-medium text-sm">Status</legend>
          {ALL_STATUSES.map((status) => (
            <div className="flex items-center gap-2" key={status}>
              <Checkbox
                checked={selectedStatuses.has(status)}
                id={`status-${status}`}
                onCheckedChange={() => toggleStatus(status)}
              />
              <Label htmlFor={`status-${status}`}>
                {STATUS_LABELS[status]}
              </Label>
            </div>
          ))}
        </fieldset>

        <div className="grid gap-2">
          <Label htmlFor="fy-select">Financial Year</Label>
          <Select onValueChange={(v) => v && setFyStart(v)} value={fyStart}>
            <SelectTrigger id="fy-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fyOptions.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            checked={includeTransactions}
            id="include-transactions"
            onCheckedChange={(checked) =>
              setIncludeTransactions(checked === true)
            }
          />
          <Label htmlFor="include-transactions">
            Include transaction details (separate CSV)
          </Label>
        </div>

        <Button
          disabled={selectedStatuses.size === 0 || isExporting}
          onClick={handleExport}
          type="button"
        >
          {isExporting ? "Exporting..." : "Export CSV"}
        </Button>
      </div>
    </div>
  );
}
