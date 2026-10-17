import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { fiscalYearLabel } from "@pi-dash/shared/compliance";
import {
  DECLARATION_FIELD_MAX,
  DECLARATION_INTERESTS_MAX,
  type DeclaredInterest,
} from "@pi-dash/shared/declarations";
import { boardOn } from "@pi-dash/shared/governance";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { selectField } from "@/components/data-table/filter-fields";
import { governanceDocumentHref } from "@/components/governance/evidence";
import { errorText } from "@/components/governance/meeting-data";
import { todayIso, useRegister } from "@/components/governance/register-data";
import { PageHeader } from "@/components/shared/page-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import { submitConflictDeclarationFn } from "@/functions/declarations";
import { formatTimestamp } from "@/lib/date-formats";

export const Route = createFileRoute("/_app/governance/declarations")({
  component: DeclarationsPage,
  head: () => ({
    meta: [{ title: `Declarations of interests | ${env.VITE_APP_NAME}` }],
  }),
});

const EMPTY: DeclaredInterest = { nature: "", party: "", relationship: "" };

interface TrusteeDeclarationRow {
  declared: boolean;
  documentId: string | null;
  id: string;
  /** The declared parties, "None", or null before declaring. */
  interests: string | null;
  name: string;
}

const filterFields: FilterField[] = [
  selectField("status", "Status", [
    { label: "Declared", value: "declared" },
    { label: "Not yet", value: "not_yet" },
  ]),
];

function getFilterValue(row: TrusteeDeclarationRow, path: string[]): unknown {
  if (path[0] === "status") {
    return row.declared ? "declared" : "not_yet";
  }
  return;
}

function searchTrustee(row: TrusteeDeclarationRow, query: string): boolean {
  return [row.name, row.interests ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}

function getRowId(row: TrusteeDeclarationRow) {
  return row.id;
}

const SKELETON_TEXT = <Skeleton className="h-5 w-36" />;
const SKELETON_BADGE = <Skeleton className="h-5.5 w-20" />;

function DeclarationsPage() {
  const { hasPermission } = useApp();
  const canSee =
    hasPermission("governance.view") || hasPermission("governance.manage");
  const today = todayIso();
  const fiscalYear = fiscalYearLabel(today);
  const { input, isLoading } = useRegister(today);
  const [mineTrustees] = useQuery(queries.trustee.me());
  const [all] = useQuery(queries.conflictDeclaration.all());
  const [mine] = useQuery(queries.conflictDeclaration.mine());
  const [declaring, setDeclaring] = useState(false);
  const board = boardOn(input, today);
  const isTrustee = mineTrustees.length > 0;
  const myDeclaration = mine.find((d) => d.fiscalYear === fiscalYear);
  const thisYear = new Map(
    all.filter((d) => d.fiscalYear === fiscalYear).map((d) => [d.trusteeId, d])
  );
  const rows: TrusteeDeclarationRow[] = board.map((m) => {
    const d = thisYear.get(m.trustee.id);
    return {
      declared: Boolean(d),
      documentId: d?.documentId ?? null,
      id: m.trustee.id,
      interests: d
        ? d.interests.map((i) => i.party).join(", ") || "None"
        : null,
      name: m.trustee.legalName,
    };
  });

  const columns: DataGridColumnDef<TrusteeDeclarationRow>[] = [
    {
      accessorFn: (row) => row.name,
      cell: ({ row }) => (
        <span className="truncate font-medium">{row.original.name}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Trustee"
          visibility={true}
        />
      ),
      id: "name",
      meta: {
        compact: "primary",
        headerTitle: "Trustee",
        kind: "person",
        skeleton: SKELETON_TEXT,
      },
      size: 220,
    },
    {
      accessorFn: (row) => (row.declared ? "declared" : "not_yet"),
      cell: ({ row }) =>
        row.original.declared ? (
          <StatusBadge tone="success">Declared</StatusBadge>
        ) : (
          <StatusBadge tone="warning">Not yet</StatusBadge>
        ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title={fiscalYear}
          visibility={true}
        />
      ),
      id: "status",
      meta: {
        compact: "trailing",
        headerTitle: fiscalYear,
        kind: "status",
        skeleton: SKELETON_BADGE,
      },
      size: 130,
    },
    {
      accessorFn: (row) => row.interests ?? "",
      cell: ({ row }) => (
        <span className="truncate">{row.original.interests ?? "—"}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Interests"
          visibility={true}
        />
      ),
      id: "interests",
      meta: { headerTitle: "Interests", skeleton: SKELETON_TEXT },
      size: 320,
    },
    {
      accessorFn: (row) => (row.documentId ? 1 : 0),
      cell: ({ row }) =>
        row.original.documentId ? (
          <a
            className="text-primary text-sm underline-offset-4 hover:underline"
            href={governanceDocumentHref(row.original.documentId)}
            rel="noreferrer"
            target="_blank"
          >
            PDF
          </a>
        ) : (
          "—"
        ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Declaration"
          visibility={true}
        />
      ),
      id: "declaration",
      meta: {
        headerTitle: "Declaration",
        kind: "link",
        skeleton: SKELETON_TEXT,
      },
      size: 130,
    },
  ];

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          isTrustee ? (
            <Button onClick={() => setDeclaring(true)} type="button">
              {myDeclaration ? "Update my declaration" : "Declare my interests"}
            </Button>
          ) : null
        }
        description={`Each trustee declares, every financial year, the people and organisations they're connected to (clause 5.3). Finance is warned when a payment goes to one of them. This year: ${fiscalYear}.`}
        title="Declarations of interests"
      />
      {isTrustee ? (
        <section className="mt-6 rounded-md border p-4 text-sm">
          {myDeclaration ? (
            <p>
              You declared{" "}
              {myDeclaration.nothingToDeclare
                ? "no interests"
                : `${myDeclaration.interests.length} interest${myDeclaration.interests.length === 1 ? "" : "s"}`}{" "}
              for {fiscalYear} on{" "}
              {formatTimestamp(
                new Date(myDeclaration.declaredAt).toISOString()
              )}
              .
            </p>
          ) : (
            <p>You haven't declared your interests for {fiscalYear} yet.</p>
          )}
        </section>
      ) : null}
      {canSee ? (
        <div className="mt-6">
          <DataTableWrapper
            columns={columns}
            compactOnMobile
            data={rows}
            emptyMessage={
              rows.length === 0
                ? "No trustees in office."
                : "No trustees match."
            }
            filter={{ fields: filterFields, getValue: getFilterValue }}
            getRowId={getRowId}
            isLoading={isLoading}
            searchFn={searchTrustee}
            searchPlaceholder="Search trustees..."
            storageKey="governance_declarations_table_state_v1"
            tableLayout={{
              columnsDraggable: true,
              columnsPinnable: true,
              columnsResizable: true,
              columnsVisibility: true,
            }}
          />
        </div>
      ) : null}
      {!(canSee || isTrustee) ? (
        <p className="text-muted-foreground mt-6 text-sm">
          Only trustees declare interests.
        </p>
      ) : null}
      {declaring ? (
        <DeclareDialog
          fiscalYear={fiscalYear}
          initial={myDeclaration?.interests ?? []}
          onClose={() => setDeclaring(false)}
        />
      ) : null}
    </div>
  );
}

function DeclareDialog({
  fiscalYear,
  initial,
  onClose,
}: {
  fiscalYear: string;
  initial: readonly DeclaredInterest[];
  onClose: () => void;
}) {
  const submit = useServerFn(submitConflictDeclarationFn);
  const [rows, setRows] = useState<DeclaredInterest[]>(() => [...initial]);
  const [busy, setBusy] = useState(false);
  const update = (index: number, patch: Partial<DeclaredInterest>) =>
    setRows((r) =>
      r.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  const complete = rows.every((r) => r.party.trim() && r.relationship.trim());

  const handleSubmit = useEventCallback(async () => {
    setBusy(true);
    await submit({ data: { interests: rows } })
      .then(() => {
        toast.success(
          rows.length === 0
            ? `Declared: no interests for ${fiscalYear}`
            : `Declared ${rows.length} interest${rows.length === 1 ? "" : "s"} for ${fiscalYear}`
        );
        onClose();
      })
      .catch((error: unknown) => {
        toast.error("The declaration wasn't saved", {
          description: errorText(error, "Something went wrong"),
        });
      })
      .finally(() => setBusy(false));
  });

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <DialogContent className="sm:max-w-(--dialog-lg)">
        <DialogHeader>
          <DialogTitle>Declare your interests for {fiscalYear}</DialogTitle>
          <DialogDescription>
            List the people and organisations you, or a relative, are connected
            to and that deal or may deal with the Trust: a business you own or
            direct, a firm a relative runs, a supplier you're related to. Leave
            the list empty if there are none.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <fieldset
              aria-label={`Interest ${index + 1}`}
              className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
              key={String(index)}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`party-${index}`}>Person or organisation</Label>
                <Input
                  id={`party-${index}`}
                  maxLength={DECLARATION_FIELD_MAX}
                  onChange={(e) => update(index, { party: e.target.value })}
                  value={row.party}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`relationship-${index}`}>Relationship</Label>
                <Input
                  id={`relationship-${index}`}
                  maxLength={DECLARATION_FIELD_MAX}
                  onChange={(e) =>
                    update(index, { relationship: e.target.value })
                  }
                  placeholder="Director, spouse's firm..."
                  value={row.relationship}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`nature-${index}`}>
                  Dealings with the Trust
                </Label>
                <Input
                  id={`nature-${index}`}
                  maxLength={DECLARATION_FIELD_MAX}
                  onChange={(e) => update(index, { nature: e.target.value })}
                  placeholder="Optional"
                  value={row.nature}
                />
              </div>
              <Button
                aria-label={`Remove interest ${index + 1}`}
                className="self-end"
                onClick={() => setRows((r) => r.filter((_, i) => i !== index))}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={Delete02Icon}
                  strokeWidth={2}
                />
              </Button>
            </fieldset>
          ))}
          <div>
            <Button
              disabled={rows.length >= DECLARATION_INTERESTS_MAX}
              onClick={() => setRows((r) => [...r, { ...EMPTY }])}
              size="sm"
              type="button"
              variant="outline"
            >
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Add an interest
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={busy || !complete}
            onClick={handleSubmit}
            type="button"
          >
            {rows.length === 0 ? "I have nothing to declare" : "Declare"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
