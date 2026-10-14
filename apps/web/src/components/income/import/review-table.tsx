import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@pi-dash/design-system/components/ui/select";
import { Switch } from "@pi-dash/design-system/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pi-dash/design-system/components/ui/table";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { formatPaise } from "@pi-dash/shared/money";
import { useState } from "react";

import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import type { ReviewCategory, RowDecision } from "@/lib/income-import/classify";
import { IMPORT_FIELD_LABELS } from "@/lib/income-import/fields";
import {
  IMPORT_OUTCOME_REASON_LABELS,
  IMPORT_ROW_OUTCOME_LABELS,
  IMPORT_ROW_OUTCOME_TONES,
  MATCH_REASON_LABELS,
  REVIEW_CATEGORY_LABELS,
  REVIEW_ROW_STATUS_LABELS,
} from "@/lib/income-import/labels";
import type { CellIssue } from "@/lib/income-import/normalize";
import type { ReviewRowView } from "@/lib/income-import/review-types";

const PAGE = 200;

const CATEGORY_TONES: Record<ReviewCategory, StatusTone> = {
  already_imported: "neutral",
  conflict: "warning",
  done: "success",
  error: "danger",
  needs_review: "warning",
  new_donor: "info",
  ready: "success",
  repeated_in_file: "neutral",
};

const TAB_ORDER: readonly ReviewCategory[] = [
  "ready",
  "new_donor",
  "needs_review",
  "conflict",
  "already_imported",
  "repeated_in_file",
  "error",
  "done",
];

type TabValue = "all" | ReviewCategory;

export function hasIssues(row: ReviewRowView): boolean {
  return (
    row.errors.length > 0 ||
    row.warnings.length > 0 ||
    row.category === "needs_review" ||
    row.category === "conflict"
  );
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });

const issueLabel = (field: CellIssue["field"]) =>
  field === "row" ? "Row" : IMPORT_FIELD_LABELS[field];

function DonorCell({ row }: { row: ReviewRowView }) {
  if (!row.rawAvailable) {
    return (
      <span className="text-muted-foreground text-sm">
        Row details removed after the retention period
      </span>
    );
  }
  const secondary = [row.email, row.maskedId].filter(Boolean).join(" · ");
  // The status badge already says "New donor"; a note only adds detail.
  let donorNote: string | null = null;
  if (row.repeatOf) {
    donorNote = `Same as row ${row.repeatOf.rowNumber}; counted once`;
  } else if (row.sameDonorAs) {
    donorNote = `Same donor as row ${row.sameDonorAs.rowNumber} (same ID number)`;
  } else if (row.donor.kind === "existing") {
    donorNote = `Existing donor: ${row.donor.name}`;
  } else if (row.donor.kind === "new" && row.donor.createdOnRow) {
    donorNote = `Same donor as row ${row.donor.createdOnRow.rowNumber}`;
  }
  return (
    <div className="min-w-0">
      <div className="truncate font-medium">{row.donorName ?? "—"}</div>
      {secondary ? (
        <div className="text-muted-foreground truncate text-xs">
          {secondary}
        </div>
      ) : null}
      {donorNote ? (
        <div className="text-muted-foreground truncate text-xs">
          {donorNote}
        </div>
      ) : null}
    </div>
  );
}

function MessagesCell({ row }: { row: ReviewRowView }) {
  const messages = [
    ...row.errors.map((e) => ({
      text: `${issueLabel(e.field)}: ${e.message}`,
      tone: "text-destructive",
    })),
    ...row.warnings.map((w) => ({
      text: `${issueLabel(w.field)}: ${w.message}`,
      tone: "text-warning-foreground",
    })),
  ];
  if (row.duplicate) {
    messages.push({
      text: `Possible duplicate of ${formatPaise(row.duplicate.amountPaise)} on ${formatDate(row.duplicate.receivedOn)} (${row.duplicate.reason === "reference" ? "same reference" : "same donor, day and amount"})`,
      tone: "text-warning-foreground",
    });
  }
  if (row.category === "conflict") {
    messages.push({
      text: "Imported before with different details; it will not be overwritten",
      tone: "text-warning-foreground",
    });
  }
  // CSV rows are pending without a reason; Razorpay rows say why they wait.
  if (row.outcomeReason) {
    messages.push({
      text:
        IMPORT_OUTCOME_REASON_LABELS[row.outcomeReason] ?? row.outcomeReason,
      tone: "text-muted-foreground",
    });
  }
  if (messages.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-0.5 text-xs">
      {messages.map((m) => (
        <li className={m.tone} key={m.text}>
          {m.text}
        </li>
      ))}
    </ul>
  );
}

function ChoiceSelect({
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  placeholder: string;
  value: string | undefined;
}) {
  const selected = options.find((o) => o.value === value)?.label;
  return (
    <Select onValueChange={(v) => onChange(String(v))} value={value ?? ""}>
      <SelectTrigger aria-label={label} className="h-8 w-full min-w-44">
        <span className="flex-1 truncate text-left">
          {selected ?? placeholder}
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DecisionCell({
  decision,
  onDecide,
  row,
}: {
  decision: RowDecision | undefined;
  onDecide: (rowId: string, decision: RowDecision) => void;
  row: ReviewRowView;
}) {
  if (row.category !== "needs_review") {
    return null;
  }
  return (
    <div className="grid gap-1.5">
      {row.sameDonorAs ? (
        <p className="text-muted-foreground text-xs">
          Donor is chosen on row {row.sameDonorAs.rowNumber}
        </p>
      ) : null}
      {row.donorOptions.length > 0 ? (
        <ChoiceSelect
          label={`Donor for row ${row.rowNumber}`}
          onChange={(donor) => onDecide(row.rowId, { ...decision, donor })}
          options={[
            ...row.donorOptions.map((o) => ({
              label: `${o.label} (${MATCH_REASON_LABELS[o.reason]})`,
              value: o.value,
            })),
            { label: "Create a new donor", value: "new" },
          ]}
          placeholder="Choose the donor"
          value={decision?.donor}
        />
      ) : null}
      {row.duplicate ? (
        <ChoiceSelect
          label={`Duplicate check for row ${row.rowNumber}`}
          onChange={(contribution) =>
            onDecide(row.rowId, {
              ...decision,
              contribution: contribution as "import" | "skip",
            })
          }
          options={[
            { label: "Import anyway", value: "import" },
            { label: "Skip this row", value: "skip" },
          ]}
          placeholder="Import or skip?"
          value={decision?.contribution}
        />
      ) : null}
    </div>
  );
}

/**
 * Rows of a batch grouped by what they would do, with per-row choices for
 * the ones that need review. Read-only on the batch page.
 */
export function ReviewTable({
  decisions,
  onDecide,
  readOnly = false,
  rows,
}: {
  decisions?: Readonly<Record<string, RowDecision>>;
  onDecide?: (rowId: string, decision: RowDecision) => void;
  readOnly?: boolean;
  rows: readonly ReviewRowView[];
}) {
  const counts = new Map<ReviewCategory, number>();
  for (const row of rows) {
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }
  const [tab, setTab] = useState<TabValue>(
    (counts.get("needs_review") ?? 0) > 0 && !readOnly ? "needs_review" : "all"
  );
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const visible = rows.filter(
    (row) =>
      (tab === "all" || row.category === tab) && (!issuesOnly || hasIssues(row))
  );
  const showDecisions = !readOnly && tab !== "error" && tab !== "done";

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          onValueChange={(value) => {
            setTab(value as TabValue);
            setLimit(PAGE);
          }}
          value={tab}
        >
          <TabsList className="flex-wrap">
            <TabsTrigger value="all">All {rows.length}</TabsTrigger>
            {TAB_ORDER.filter((c) => (counts.get(c) ?? 0) > 0).map((c) => (
              <TabsTrigger key={c} value={c}>
                {REVIEW_CATEGORY_LABELS[c]} {counts.get(c)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <label
          className="flex items-center gap-2 text-sm"
          htmlFor="issues-only"
        >
          <Switch
            checked={issuesOnly}
            id="issues-only"
            onCheckedChange={setIssuesOnly}
          />
          Show only rows with issues
        </label>
      </div>
      <div className="ring-border rounded-lg ring-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Row</TableHead>
              <TableHead>Donor</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Received on</TableHead>
              <TableHead>Status</TableHead>
              {showDecisions ? <TableHead>Decision</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.slice(0, limit).map((row) => (
              <TableRow data-row-number={row.rowNumber} key={row.rowId}>
                <TableCell className="text-muted-foreground align-top tabular-nums">
                  {row.rowNumber}
                </TableCell>
                <TableCell className="max-w-64 align-top">
                  <DonorCell row={row} />
                  {row.reference ? (
                    <div className="text-muted-foreground truncate text-xs">
                      Ref {row.reference}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="text-right align-top tabular-nums">
                  {row.amountPaise === null
                    ? "—"
                    : formatPaise(row.amountPaise)}
                </TableCell>
                <TableCell className="align-top whitespace-nowrap">
                  {row.receivedOn ? formatDate(row.receivedOn) : "—"}
                </TableCell>
                <TableCell className="max-w-80 align-top whitespace-normal">
                  <div className="grid gap-1">
                    {readOnly ? (
                      <StatusBadge tone={IMPORT_ROW_OUTCOME_TONES[row.outcome]}>
                        {row.outcome === "linked_existing" && row.repeatOf
                          ? REVIEW_ROW_STATUS_LABELS.repeated_in_file
                          : IMPORT_ROW_OUTCOME_LABELS[row.outcome]}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone={CATEGORY_TONES[row.category]}>
                        {REVIEW_ROW_STATUS_LABELS[row.category]}
                      </StatusBadge>
                    )}
                    <MessagesCell row={row} />
                  </div>
                </TableCell>
                {showDecisions ? (
                  <TableCell className="align-top">
                    {onDecide ? (
                      <DecisionCell
                        decision={decisions?.[row.rowId]}
                        onDecide={onDecide}
                        row={row}
                      />
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  className="text-muted-foreground py-8 text-center"
                  colSpan={showDecisions ? 6 : 5}
                >
                  No rows here.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      {visible.length > limit ? (
        <Button
          className="justify-self-center"
          onClick={() => setLimit((n) => n + PAGE)}
          type="button"
          variant="outline"
        >
          Show {Math.min(PAGE, visible.length - limit)} more of{" "}
          {visible.length - limit}
        </Button>
      ) : null}
    </div>
  );
}
