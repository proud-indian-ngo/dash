import { Button } from "@pi-dash/design-system/components/ui/button";
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
import { format } from "date-fns";
import { useState } from "react";

import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { STATEMENT_ROW_CATEGORY_LABELS } from "@/lib/bank-statement/labels";
import { STATEMENT_SKIP_MESSAGES } from "@/lib/bank-statement/normalize";
import type {
  StatementReviewRow,
  StatementRowCategory,
} from "@/lib/bank-statement/types";
import { DATE } from "@/lib/date-formats";

const PAGE = 200;

const CATEGORY_TONES: Record<StatementRowCategory, StatusTone> = {
  error: "danger",
  existing: "neutral",
  new: "success",
  skipped: "neutral",
};

const ROW_STATUS: Record<StatementRowCategory, string> = {
  error: "Error",
  existing: "Already imported",
  new: "New",
  skipped: "Skipped",
};

const TAB_ORDER: readonly StatementRowCategory[] = [
  "new",
  "existing",
  "skipped",
  "error",
];

const formatIsoDate = (iso: string) =>
  format(new Date(`${iso}T00:00:00`), DATE);

function Detail({ row }: { row: StatementReviewRow }) {
  if (row.category === "skipped") {
    return (
      <div className="min-w-0">
        <div className="text-muted-foreground text-xs">
          {row.skipReason ? STATEMENT_SKIP_MESSAGES[row.skipReason] : ""}
        </div>
        {row.preview ? (
          <div className="truncate text-xs" title={row.preview}>
            {row.preview}
          </div>
        ) : null}
      </div>
    );
  }
  if (row.category === "error") {
    return (
      <ul className="text-destructive space-y-0.5 text-xs">
        {row.errors.map((issue) => (
          <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
        ))}
      </ul>
    );
  }
  return (
    <div className="min-w-0">
      <div className="truncate" title={row.narration ?? undefined}>
        {row.narration || "—"}
      </div>
      {row.reference ? (
        <div className="text-muted-foreground truncate font-mono text-xs">
          {row.reference}
        </div>
      ) : null}
      {row.warnings.map((issue) => (
        <div className="text-warning-foreground text-xs" key={issue.message}>
          {issue.message}
        </div>
      ))}
    </div>
  );
}

/** The review step: every row of the file, by what importing would do with it. */
export function StatementReviewTable({
  rows,
}: {
  rows: readonly StatementReviewRow[];
}) {
  const [tab, setTab] = useState<StatementRowCategory | "all">("all");
  const [shown, setShown] = useState(PAGE);
  const counts = new Map<StatementRowCategory, number>();
  for (const row of rows) {
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }
  const visible = rows.filter((row) => tab === "all" || row.category === tab);
  return (
    <div className="grid gap-3">
      <Tabs
        onValueChange={(value) => {
          setTab(value as StatementRowCategory | "all");
          setShown(PAGE);
        }}
        value={tab}
      >
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">All {rows.length}</TabsTrigger>
          {TAB_ORDER.filter((c) => (counts.get(c) ?? 0) > 0).map((c) => (
            <TabsTrigger key={c} value={c}>
              {STATEMENT_ROW_CATEGORY_LABELS[c]} {counts.get(c)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="ring-border rounded-lg ring-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Row</TableHead>
              <TableHead className="w-32">Date</TableHead>
              <TableHead>Narration</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-36">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.slice(0, shown).map((row) => (
              <TableRow data-row-number={row.rowNumber} key={row.rowId}>
                <TableCell className="text-muted-foreground align-top tabular-nums">
                  {row.rowNumber}
                </TableCell>
                <TableCell className="align-top font-mono">
                  {row.valueOn ? formatIsoDate(row.valueOn) : "—"}
                </TableCell>
                <TableCell className="max-w-96 align-top">
                  <Detail row={row} />
                </TableCell>
                <TableCell
                  className={
                    row.direction === "credit"
                      ? "text-success-foreground text-right align-top font-mono"
                      : "text-right align-top font-mono"
                  }
                >
                  {row.amountPaise === null
                    ? "—"
                    : `${row.direction === "debit" ? "−" : "+"}${formatPaise(row.amountPaise)}`}
                </TableCell>
                <TableCell className="align-top">
                  <StatusBadge tone={CATEGORY_TONES[row.category]}>
                    {ROW_STATUS[row.category]}
                  </StatusBadge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {visible.length > shown ? (
        <div>
          <Button
            onClick={() => setShown((n) => n + PAGE)}
            type="button"
            variant="outline"
          >
            Show more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
