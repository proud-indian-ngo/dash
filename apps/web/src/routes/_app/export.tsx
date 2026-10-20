import { FileExportIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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

import { SettingsCard, SettingsRow } from "@/components/settings/settings-ui";
import { PageHeader } from "@/components/shared/page-header";
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
  headers: () => ({ "Cache-Control": "private, no-store" }),
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
  invoice_pending: "Invoice pending",
  paid: "Paid",
  partially_paid: "Partially paid",
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
    <Label
      className="hover:bg-muted/50 flex h-8 cursor-pointer items-center gap-2 rounded-md border px-2.5 font-normal pointer-coarse:h-10 pointer-coarse:px-3"
      htmlFor={id}
    >
      <Checkbox
        checked={checked}
        id={id}
        onCheckedChange={handleCheckedChange}
      />
      {label}
    </Label>
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
      <PageHeader
        description="One financial year as a ZIP: a CSV per kind of request, plus their attachments."
        title="Export data"
      />

      <div className="mt-6 flex max-w-3xl flex-col gap-6">
        <SettingsCard title="What to export">
          <SettingsRow
            description="Claims paid back to volunteers, with their receipts."
            inline
            title="Reimbursements"
          >
            <Checkbox
              aria-label="Reimbursements"
              checked={includeReimbursements}
              id="reimbursements"
              onCheckedChange={handleReimbursementsChange}
            />
          </SettingsRow>
          <SettingsRow
            description="Money paid out before an expense, with its settlement."
            inline
            title="Advance payments"
          >
            <Checkbox
              aria-label="Advance payments"
              checked={includeAdvancePayments}
              id="advance-payments"
              onCheckedChange={handleAdvancePaymentsChange}
            />
          </SettingsRow>
          <SettingsRow
            description="Payments to vendors, with quotations and invoices."
            inline
            title="Vendor payments"
          >
            <Checkbox
              aria-label="Vendor payments"
              checked={includeVendorPayments}
              id="vendor-payments"
              onCheckedChange={handleVendorPaymentsChange}
            />
          </SettingsRow>
          {includeVendorPayments ? (
            <SettingsRow
              description="Each recorded payment as a separate CSV."
              inline
              title="Include payment transactions"
            >
              <Checkbox
                aria-label="Include payment transactions"
                checked={includeTransactions}
                id="include-transactions"
                onCheckedChange={handleTransactionsChange}
              />
            </SettingsRow>
          ) : null}
        </SettingsCard>

        {hasRequestSelection || includeVendorPayments ? (
          <SettingsCard title="Statuses">
            {hasRequestSelection ? (
              <fieldset className="flex flex-col gap-2 px-4 py-3">
                <legend className="mb-2 text-sm font-medium">
                  Reimbursements and advance payments
                </legend>
                <div className="flex flex-wrap gap-2">
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
                </div>
              </fieldset>
            ) : null}
            {includeVendorPayments ? (
              <fieldset className="flex flex-col gap-2 px-4 py-3">
                <legend className="mb-2 text-sm font-medium">
                  Vendor payments
                </legend>
                <div className="flex flex-wrap gap-2">
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
                </div>
              </fieldset>
            ) : null}
          </SettingsCard>
        ) : null}

        <SettingsCard title="Period">
          <SettingsRow
            description="April to March. Reimbursements count by expense date; everything else by when it was submitted."
            title="Financial year"
          >
            <Select onValueChange={handleFyChange} value={fyStart}>
              <SelectTrigger
                aria-label="Financial year"
                className="w-40"
                id="fy-select"
              >
                <SelectValue>
                  {
                    fyOptions.find((option) => String(option.value) === fyStart)
                      ?.label
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {fyOptions.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsCard>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {hasSelection && !hasValidStatuses ? (
            <p className="text-muted-foreground text-sm">
              Pick at least one status.
            </p>
          ) : null}
          {hasSelection ? null : (
            <p className="text-muted-foreground text-sm">
              Pick at least one kind of data.
            </p>
          )}
          <Button
            disabled={!(hasSelection && hasValidStatuses) || isExporting}
            onClick={handleExport}
            type="button"
          >
            <HugeiconsIcon
              className="size-4"
              icon={FileExportIcon}
              strokeWidth={2}
            />
            {isExporting ? "Exporting..." : "Export ZIP"}
          </Button>
        </div>
      </div>
    </div>
  );
}
