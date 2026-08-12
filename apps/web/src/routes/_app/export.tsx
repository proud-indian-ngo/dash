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
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";
import { log } from "evlog";
import { type Dispatch, type SetStateAction, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";
import {
  type RequestExportStatus,
  type RequestExportType,
  requestExportStatusValues,
  type VendorPaymentExportStatus,
  vendorPaymentExportStatusValues,
} from "@/lib/financial-export-contract";
import { downloadFinancialExport } from "@/lib/financial-export-download";
import { assertPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/export")({
  beforeLoad: ({ context }) => assertPermission(context, "requests.export"),
  component: ExportRouteComponent,
  head: () => ({
    meta: [{ title: `Export Data | ${env.VITE_APP_NAME}` }],
  }),
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

const ALL_STATUSES = requestExportStatusValues;
type Status = RequestExportStatus;

const STATUS_LABELS: Record<Status, string> = {
  approved: "Approved",
  pending: "Pending",
  rejected: "Rejected",
};

const VP_STATUSES = vendorPaymentExportStatusValues;
type VPStatus = VendorPaymentExportStatus;

const VP_STATUS_LABELS: Record<VPStatus, string> = {
  approved: "Approved",
  completed: "Completed",
  invoice_pending: "Invoice Pending",
  paid: "Paid",
  partially_paid: "Partially Paid",
  pending: "Pending",
  rejected: "Rejected",
};

function toggleSetItem<T>(
  setter: Dispatch<SetStateAction<Set<T>>>,
  item: T
): void {
  setter((previous) => {
    const next = new Set(previous);
    if (next.has(item)) {
      next.delete(item);
    } else {
      next.add(item);
    }
    return next;
  });
}

function StatusCheckbox<T extends string>({
  checked,
  id,
  label,
  onToggle,
  value,
}: {
  checked: boolean;
  id: string;
  label: string;
  onToggle: (value: T) => void;
  value: T;
}) {
  const handleCheckedChange = useEventCallback(() => onToggle(value));

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={checked}
        id={id}
        onCheckedChange={handleCheckedChange}
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}

const getRequestTypes = (
  includeReimbursements: boolean,
  includeAdvancePayments: boolean
): RequestExportType[] => {
  const types: RequestExportType[] = [];
  if (includeReimbursements) {
    types.push("reimbursement");
  }
  if (includeAdvancePayments) {
    types.push("advancePayment");
  }
  return types;
};

const getSelectedValues = <T,>(values: Set<T>, allValues: readonly T[]) =>
  values.size === allValues.length ? undefined : [...values];

function getExportedLabels(
  result: Awaited<ReturnType<typeof downloadFinancialExport>>,
  options: {
    hasRequestSelection: boolean;
    includeTransactions: boolean;
    includeVendorPayments: boolean;
  }
): string[] {
  const labels: string[] = [];
  if (options.hasRequestSelection) {
    labels.push(`${result.requestCount} reimbursements`);
  }
  if (options.includeVendorPayments) {
    labels.push(`${result.vendorPaymentCount} vendor payments`);
  }
  if (options.includeTransactions && result.transactionCount > 0) {
    labels.push(`${result.transactionCount} transactions`);
  }
  return labels;
}

function ExportRouteComponent() {
  const fyOptions = FY_OPTIONS;
  const [includeReimbursements, setIncludeReimbursements] = useState(true);
  const [includeAdvancePayments, setIncludeAdvancePayments] = useState(true);
  const [includeVendorPayments, setIncludeVendorPayments] = useState(false);
  const [includeTransactions, setIncludeTransactions] = useState(false);
  const [fyStart, setFyStart] = useState(String(fyOptions[0]?.value));
  const [selectedStatuses, setSelectedStatuses] = useState<Set<Status>>(
    () => new Set(ALL_STATUSES)
  );
  const [selectedVPStatuses, setSelectedVPStatuses] = useState<Set<VPStatus>>(
    () => new Set(VP_STATUSES)
  );
  const [isExporting, setIsExporting] = useState(false);

  const hasRequestSelection = includeReimbursements || includeAdvancePayments;
  const hasSelection = hasRequestSelection || includeVendorPayments;
  const hasValidStatuses =
    (hasRequestSelection ? selectedStatuses.size > 0 : true) &&
    (includeVendorPayments ? selectedVPStatuses.size > 0 : true);

  const handleExport = useEventCallback(() => {
    if (!hasSelection) {
      return;
    }
    setIsExporting(true);
    return downloadFinancialExport({
      fyStart: Number(fyStart),
      includeTransactions,
      includeVendorPayments,
      requestStatuses: getSelectedValues(selectedStatuses, ALL_STATUSES),
      requestTypes: getRequestTypes(
        includeReimbursements,
        includeAdvancePayments
      ),
      vendorPaymentStatuses: getSelectedValues(selectedVPStatuses, VP_STATUSES),
    })
      .then((result) => {
        const exported = getExportedLabels(result, {
          hasRequestSelection,
          includeTransactions,
          includeVendorPayments,
        });
        toast.success(`Exported ${exported.join(", ")}!`);
      })
      .catch((error: unknown) => {
        log.error({
          action: "downloadFinancialExport",
          component: "ExportRoute",
          error: error instanceof Error ? error.message : String(error),
          fyStart,
          includeAdvancePayments,
          includeReimbursements,
          includeTransactions,
          includeVendorPayments,
        });
        toast.error(`Export: ${getErrorMessage(error)}`);
      })
      .finally(() => {
        setIsExporting(false);
      });
  });
  const handleReimbursementsChange = useEventCallback((checked: boolean) =>
    setIncludeReimbursements(checked === true)
  );
  const handleAdvancePaymentsChange = useEventCallback((checked: boolean) =>
    setIncludeAdvancePayments(checked === true)
  );
  const handleVendorPaymentsChange = useEventCallback((checked: boolean) =>
    setIncludeVendorPayments(checked === true)
  );
  const handleTransactionsChange = useEventCallback((checked: boolean) =>
    setIncludeTransactions(checked === true)
  );
  const handleFyChange = useEventCallback(
    (value: string | null) => value && setFyStart(value)
  );
  const toggleRequestStatus = useEventCallback((status: Status) =>
    toggleSetItem(setSelectedStatuses, status)
  );
  const toggleVendorPaymentStatus = useEventCallback((status: VPStatus) =>
    toggleSetItem(setSelectedVPStatuses, status)
  );

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        Export Data
      </h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Export reimbursement, advance payment, and vendor payment data as a ZIP
        containing CSV files and request attachments for a financial year.
      </p>

      <div className="mt-4 grid max-w-md gap-6">
        <fieldset className="grid gap-3">
          <legend className="font-medium text-sm">Data types</legend>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={includeReimbursements}
              id="reimbursements"
              onCheckedChange={handleReimbursementsChange}
            />
            <Label htmlFor="reimbursements">Reimbursements</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={includeAdvancePayments}
              id="advance-payments"
              onCheckedChange={handleAdvancePaymentsChange}
            />
            <Label htmlFor="advance-payments">Advance Payments</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={includeVendorPayments}
              id="vendor-payments"
              onCheckedChange={handleVendorPaymentsChange}
            />
            <Label htmlFor="vendor-payments">Vendor Payments</Label>
          </div>
          {Boolean(includeVendorPayments) && (
            <div className="ml-6 flex items-center gap-2">
              <Checkbox
                checked={includeTransactions}
                id="include-transactions"
                onCheckedChange={handleTransactionsChange}
              />
              <Label htmlFor="include-transactions">
                Include transaction details (separate CSV)
              </Label>
            </div>
          )}
        </fieldset>

        {Boolean(hasRequestSelection) && (
          <fieldset className="grid gap-3">
            <legend className="font-medium text-sm">
              Reimbursement status
            </legend>
            {ALL_STATUSES.map((status) => (
              <StatusCheckbox
                checked={selectedStatuses.has(status)}
                id={`status-${status}`}
                key={status}
                label={STATUS_LABELS[status]}
                onToggle={toggleRequestStatus}
                value={status}
              />
            ))}
          </fieldset>
        )}

        {Boolean(includeVendorPayments) && (
          <fieldset className="grid gap-3">
            <legend className="font-medium text-sm">
              Vendor payment status
            </legend>
            {VP_STATUSES.map((status) => (
              <StatusCheckbox
                checked={selectedVPStatuses.has(status)}
                id={`vp-status-${status}`}
                key={`vp-${status}`}
                label={VP_STATUS_LABELS[status]}
                onToggle={toggleVendorPaymentStatus}
                value={status}
              />
            ))}
          </fieldset>
        )}

        <div className="grid gap-2">
          <Label htmlFor="fy-select">Financial Year</Label>
          <Select onValueChange={handleFyChange} value={fyStart}>
            <SelectTrigger id="fy-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fyOptions.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
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
          {isExporting ? "Exporting..." : "Export ZIP"}
        </Button>
      </div>
    </div>
  );
}
