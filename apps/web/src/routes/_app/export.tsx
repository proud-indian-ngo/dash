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
import { type Dispatch, type SetStateAction, useState } from "react";
import { toast } from "sonner";
import {
  type ExportAttachment,
  type ExportRow,
  exportCsvData,
} from "@/functions/export-csv";
import {
  exportVendorPaymentsCsv,
  type TransactionExportRow,
  type VendorPaymentExportRow,
  vendorPaymentStatusValues,
} from "@/functions/export-vendor-payments-csv";
import { getAttachmentPreviewHref } from "@/lib/attachment-links";
import { downloadCsv } from "@/lib/csv-export";
import { getErrorMessage } from "@/lib/errors";
import { assertPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/export")({
  head: () => ({
    meta: [{ title: `Export Data | ${env.VITE_APP_NAME}` }],
  }),
  beforeLoad: ({ context }) => assertPermission(context, "requests.export"),
  component: ExportRouteComponent,
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

const ALL_STATUSES = ["pending", "approved", "rejected"] as const;
type Status = (typeof ALL_STATUSES)[number];

const STATUS_LABELS: Record<Status, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const VP_STATUSES = vendorPaymentStatusValues;
type VPStatus = (typeof VP_STATUSES)[number];

const VP_STATUS_LABELS: Record<VPStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  partially_paid: "Partially Paid",
  paid: "Paid",
};

const REQUEST_CSV_HEADERS = [
  "Type",
  "Title",
  "Created By",
  "Email",
  "Status",
  "Total",
  "City",
  "Expense Date",
  "Submitted At",
  "Created At",
  "Attachments",
];

const VP_CSV_HEADERS = [
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

const TX_CSV_HEADERS = [
  "Vendor Payment",
  "Amount",
  "Description",
  "Transaction Date",
  "Payment Method",
  "Reference",
  "Status",
  "Recorded By",
];

function formatAttachments(attachments: ExportAttachment[]): string {
  if (attachments.length === 0) {
    return "";
  }
  return attachments
    .map((a) => getAttachmentPreviewHref(a))
    .filter((href) => href !== "#")
    .join(" | ");
}

function requestRowToArray(row: ExportRow): string[] {
  return [
    row.type,
    row.title,
    row.createdBy,
    row.email,
    row.status,
    row.total,
    row.city,
    row.expenseDate,
    row.submittedAt,
    row.createdAt,
    formatAttachments(row.attachments),
  ];
}

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

function buildRequestFilename(
  includeReimbursements: boolean,
  includeAdvancePayments: boolean,
  selectedStatuses: Set<Status>,
  fyStartNum: number,
  today: string
): string {
  const typeParts: string[] = [];
  if (includeReimbursements) {
    typeParts.push("reimbursements");
  }
  if (includeAdvancePayments) {
    typeParts.push("advance-payments");
  }

  const statusPart =
    selectedStatuses.size === ALL_STATUSES.length
      ? "all-statuses"
      : [...selectedStatuses].sort().join("-");

  return `${typeParts.join("_")}_${statusPart}_FY${fyStartNum}-${String(fyStartNum + 1).slice(2)}_${today}.csv`;
}

function buildFyDateSuffix(fyStartNum: number, today: string): string {
  return `FY${fyStartNum}-${String(fyStartNum + 1).slice(2)}_${today}`;
}

function toggleSetItem<T>(
  setter: Dispatch<SetStateAction<Set<T>>>,
  item: T
): void {
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(item)) {
      next.delete(item);
    } else {
      next.add(item);
    }
    return next;
  });
}

async function exportRequests(
  runExport: ReturnType<typeof useServerFn<typeof exportCsvData>>,
  opts: {
    includeReimbursements: boolean;
    includeAdvancePayments: boolean;
    fyStartNum: number;
    selectedStatuses: Set<Status>;
    today: string;
  }
): Promise<string> {
  const types: ("reimbursement" | "advancePayment")[] = [];
  if (opts.includeReimbursements) {
    types.push("reimbursement");
  }
  if (opts.includeAdvancePayments) {
    types.push("advancePayment");
  }
  const statuses =
    opts.selectedStatuses.size === ALL_STATUSES.length
      ? undefined
      : [...opts.selectedStatuses];
  const result = await runExport({
    data: { types, fyStart: opts.fyStartNum, statuses },
  });
  const filename = buildRequestFilename(
    opts.includeReimbursements,
    opts.includeAdvancePayments,
    opts.selectedStatuses,
    opts.fyStartNum,
    opts.today
  );
  downloadCsv(
    filename,
    REQUEST_CSV_HEADERS,
    result.rows.map(requestRowToArray)
  );
  return `${result.rows.length} requests`;
}

async function exportVendorPayments(
  runExport: ReturnType<typeof useServerFn<typeof exportVendorPaymentsCsv>>,
  opts: {
    fyStartNum: number;
    selectedVPStatuses: Set<VPStatus>;
    includeTransactions: boolean;
    today: string;
  }
): Promise<string[]> {
  const statuses =
    opts.selectedVPStatuses.size === VP_STATUSES.length
      ? undefined
      : [...opts.selectedVPStatuses];
  const result = await runExport({
    data: {
      fyStart: opts.fyStartNum,
      statuses,
      includeTransactions: opts.includeTransactions,
    },
  });
  const dateSuffix = buildFyDateSuffix(opts.fyStartNum, opts.today);
  downloadCsv(
    `vendor-payments_${dateSuffix}.csv`,
    VP_CSV_HEADERS,
    result.rows.map(vpRowToArray)
  );
  const parts = [`${result.rows.length} vendor payments`];

  if (opts.includeTransactions && result.transactionRows.length > 0) {
    downloadCsv(
      `vendor-payment-transactions_${dateSuffix}.csv`,
      TX_CSV_HEADERS,
      result.transactionRows.map(txRowToArray)
    );
    parts.push(`${result.transactionRows.length} transactions`);
  }
  return parts;
}

async function runAllExports(opts: {
  hasRequestSelection: boolean;
  includeVendorPayments: boolean;
  runRequestExport: ReturnType<typeof useServerFn<typeof exportCsvData>>;
  runVPExport: ReturnType<typeof useServerFn<typeof exportVendorPaymentsCsv>>;
  includeReimbursements: boolean;
  includeAdvancePayments: boolean;
  fyStartNum: number;
  selectedStatuses: Set<Status>;
  selectedVPStatuses: Set<VPStatus>;
  includeTransactions: boolean;
  today: string;
}): Promise<void> {
  const exported: string[] = [];
  const errors: string[] = [];

  if (opts.hasRequestSelection) {
    try {
      const label = await exportRequests(opts.runRequestExport, {
        includeReimbursements: opts.includeReimbursements,
        includeAdvancePayments: opts.includeAdvancePayments,
        fyStartNum: opts.fyStartNum,
        selectedStatuses: opts.selectedStatuses,
        today: opts.today,
      });
      exported.push(label);
    } catch (error) {
      log.error({
        component: "ExportRoute",
        action: "exportRequests",
        error: error instanceof Error ? error.message : String(error),
      });
      errors.push(`Requests: ${getErrorMessage(error)}`);
    }
  }

  if (opts.includeVendorPayments) {
    try {
      const labels = await exportVendorPayments(opts.runVPExport, {
        fyStartNum: opts.fyStartNum,
        selectedVPStatuses: opts.selectedVPStatuses,
        includeTransactions: opts.includeTransactions,
        today: opts.today,
      });
      exported.push(...labels);
    } catch (error) {
      log.error({
        component: "ExportRoute",
        action: "exportVendorPayments",
        error: error instanceof Error ? error.message : String(error),
      });
      errors.push(`Vendor payments: ${getErrorMessage(error)}`);
    }
  }

  if (exported.length > 0) {
    toast.success(`Exported ${exported.join(", ")}`);
  }
  for (const err of errors) {
    toast.error(err);
  }
  if (exported.length === 0 && errors.length === 0) {
    toast.error("No data to export");
  }
}

function ExportRouteComponent() {
  const runRequestExport = useServerFn(exportCsvData);
  const runVPExport = useServerFn(exportVendorPaymentsCsv);
  const fyOptions = FY_OPTIONS;

  const [includeReimbursements, setIncludeReimbursements] = useState(true);
  const [includeAdvancePayments, setIncludeAdvancePayments] = useState(true);
  const [includeVendorPayments, setIncludeVendorPayments] = useState(false);
  const [includeTransactions, setIncludeTransactions] = useState(false);
  const [fyStart, setFyStart] = useState(String(fyOptions[0]?.value));
  const [selectedStatuses, setSelectedStatuses] = useState<Set<Status>>(
    new Set(ALL_STATUSES)
  );
  const [selectedVPStatuses, setSelectedVPStatuses] = useState<Set<VPStatus>>(
    new Set(VP_STATUSES)
  );
  const [isExporting, setIsExporting] = useState(false);

  const hasRequestSelection = includeReimbursements || includeAdvancePayments;
  const hasSelection = hasRequestSelection || includeVendorPayments;

  const hasValidStatuses =
    (hasRequestSelection ? selectedStatuses.size > 0 : true) &&
    (includeVendorPayments ? selectedVPStatuses.size > 0 : true);

  const handleExport = async () => {
    if (!hasSelection) {
      return;
    }
    setIsExporting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const fyStartNum = Number(fyStart);
      await runAllExports({
        hasRequestSelection,
        includeVendorPayments,
        runRequestExport,
        runVPExport,
        includeReimbursements,
        includeAdvancePayments,
        fyStartNum,
        selectedStatuses,
        selectedVPStatuses,
        includeTransactions,
        today,
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        Export Data
      </h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Export reimbursement, advance payment, and vendor payment data as CSV
        for a financial year.
      </p>

      <div className="mt-4 grid max-w-md gap-6">
        <fieldset className="grid gap-3">
          <legend className="font-medium text-sm">Data types</legend>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={includeReimbursements}
              id="reimbursements"
              onCheckedChange={(checked) =>
                setIncludeReimbursements(checked === true)
              }
            />
            <Label htmlFor="reimbursements">Reimbursements</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={includeAdvancePayments}
              id="advance-payments"
              onCheckedChange={(checked) =>
                setIncludeAdvancePayments(checked === true)
              }
            />
            <Label htmlFor="advance-payments">Advance Payments</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={includeVendorPayments}
              id="vendor-payments"
              onCheckedChange={(checked) =>
                setIncludeVendorPayments(checked === true)
              }
            />
            <Label htmlFor="vendor-payments">Vendor Payments</Label>
          </div>
          {includeVendorPayments && (
            <div className="ml-6 flex items-center gap-2">
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
          )}
        </fieldset>

        {hasRequestSelection && (
          <fieldset className="grid gap-3">
            <legend className="font-medium text-sm">Request status</legend>
            {ALL_STATUSES.map((status) => (
              <div className="flex items-center gap-2" key={status}>
                <Checkbox
                  checked={selectedStatuses.has(status)}
                  id={`status-${status}`}
                  onCheckedChange={() =>
                    toggleSetItem(setSelectedStatuses, status)
                  }
                />
                <Label htmlFor={`status-${status}`}>
                  {STATUS_LABELS[status]}
                </Label>
              </div>
            ))}
          </fieldset>
        )}

        {includeVendorPayments && (
          <fieldset className="grid gap-3">
            <legend className="font-medium text-sm">
              Vendor payment status
            </legend>
            {VP_STATUSES.map((status) => (
              <div className="flex items-center gap-2" key={`vp-${status}`}>
                <Checkbox
                  checked={selectedVPStatuses.has(status)}
                  id={`vp-status-${status}`}
                  onCheckedChange={() =>
                    toggleSetItem(setSelectedVPStatuses, status)
                  }
                />
                <Label htmlFor={`vp-status-${status}`}>
                  {VP_STATUS_LABELS[status]}
                </Label>
              </div>
            ))}
          </fieldset>
        )}

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

        <Button
          disabled={!(hasSelection && hasValidStatuses) || isExporting}
          onClick={handleExport}
          type="button"
        >
          {isExporting ? "Exporting..." : "Export CSV"}
        </Button>
      </div>
    </div>
  );
}
