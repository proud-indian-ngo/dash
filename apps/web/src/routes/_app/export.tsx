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
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  type ExportAttachment,
  type ExportRow,
  exportCsvData,
} from "@/functions/export-csv";
import { getAttachmentPreviewHref } from "@/lib/attachment-links";
import { downloadCsv } from "@/lib/csv-export";
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_app/export")({
  beforeLoad: ({ context }) => {
    if (!context.session || context.session.user.role !== "admin") {
      throw redirect({ to: "/" });
    }
  },
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

const CSV_HEADERS = [
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

function formatAttachments(attachments: ExportAttachment[]): string {
  if (attachments.length === 0) {
    return "";
  }
  return attachments
    .map((a) => getAttachmentPreviewHref(a))
    .filter((href) => href !== "#")
    .join(" | ");
}

function rowToArray(row: ExportRow): string[] {
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

function ExportRouteComponent() {
  const runExport = useServerFn(exportCsvData);
  const fyOptions = FY_OPTIONS;

  const [includeReimbursements, setIncludeReimbursements] = useState(true);
  const [includeAdvancePayments, setIncludeAdvancePayments] = useState(true);
  const [fyStart, setFyStart] = useState(String(fyOptions[0]?.value));
  const [selectedStatuses, setSelectedStatuses] = useState<Set<Status>>(
    new Set(ALL_STATUSES)
  );
  const [isExporting, setIsExporting] = useState(false);

  const hasSelection = includeReimbursements || includeAdvancePayments;

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
    const types: ("reimbursement" | "advancePayment")[] = [];
    if (includeReimbursements) {
      types.push("reimbursement");
    }
    if (includeAdvancePayments) {
      types.push("advancePayment");
    }

    if (types.length === 0) {
      toast.error("Select at least one type");
      return;
    }

    setIsExporting(true);
    try {
      const fyStartNum = Number(fyStart);
      const statuses =
        selectedStatuses.size === ALL_STATUSES.length
          ? undefined
          : [...selectedStatuses];
      const result = await runExport({
        data: { types, fyStart: fyStartNum, statuses },
      });
      const filename = `export-FY${fyStartNum}-${String(fyStartNum + 1).slice(2)}.csv`;
      downloadCsv(filename, CSV_HEADERS, result.rows.map(rowToArray));
      toast.success(`Exported ${result.rows.length} records`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-semibold text-2xl">Export Data</h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Export reimbursement and advance payment data as CSV for a financial
        year.
      </p>

      <div className="mt-6 grid max-w-md gap-6">
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
        </fieldset>

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

        <Button
          disabled={!hasSelection || selectedStatuses.size === 0 || isExporting}
          onClick={handleExport}
          type="button"
        >
          {isExporting ? "Exporting..." : "Export CSV"}
        </Button>
      </div>
    </div>
  );
}
