import {
  Alert02Icon,
  AlertCircleIcon,
  ArrowDown01Icon,
  CheckmarkCircle02Icon,
  Coins01Icon,
  FileDownloadIcon,
  InformationCircleIcon,
  MinusSignCircleIcon,
  UserLove01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@pi-dash/design-system/components/ui/collapsible";
import { Progress } from "@pi-dash/design-system/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import type { ContributionChannel } from "@pi-dash/shared/constants";
import {
  defaultReturnYear,
  RETURN_FORM_NAME,
} from "@pi-dash/shared/donations-return";
import {
  CONTRIBUTION_CHANNEL_LABELS,
  isContributionEditable,
} from "@pi-dash/shared/income";
import { formatPaise } from "@pi-dash/shared/money";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { log } from "evlog";
import { parseAsString, useQueryState } from "nuqs";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";

import { DonorDetailSheet } from "@/components/donors/donor-detail-sheet";
import { DonorFormDialog } from "@/components/donors/donor-form-dialog";
import type { PartyRow } from "@/components/donors/party-row";
import { ContributionDetailSheet } from "@/components/income/contribution-detail-sheet";
import { ContributionFormDialog } from "@/components/income/contribution-form-dialog";
import { contributionsSignature } from "@/components/income/contribution-stats";
import {
  buildChecklist,
  type ChecklistRow,
  type ChecklistSection,
  donorCount,
} from "@/components/income/donations-return-checklist";
import { formatReceivedOn } from "@/components/income/income-date";
import type { ContributionRow } from "@/components/income/income-types";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
import { StatsSkeleton } from "@/components/shared/page-skeleton";
import { StatsCards, type StatItem } from "@/components/stats/stats-cards";
import { useApp } from "@/context/app-context";
import {
  type DonationsReturnReadiness,
  exportDonationsReturn,
  getDonationsReturnReadiness,
} from "@/functions/donations-return";
import { DATE } from "@/lib/date-formats";

/** Loads the server's assessment; refetched when gifts change, after a donor save and on focus. */
function useReadiness(financialYear: string, refreshKey: string) {
  const load = useServerFn(getDonationsReturnReadiness);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { data: DonationsReturnReadiness; kind: "ready" }
  >({ kind: "loading" });
  const [focusCount, setFocusCount] = useState(0);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const onFocus = () => setFocusCount((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  useEffect(() => {
    let cancelled = false;
    load({ data: { financialYear } })
      .then((data) => {
        if (!cancelled) {
          setState({ data, kind: "ready" });
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "donationsReturn.load",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "DonationsReturnPage",
        });
        if (!cancelled) {
          setState((current) =>
            current.kind === "ready" ? current : { kind: "error" }
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [financialYear, refreshKey, focusCount, attempt, load]);
  const retry = useEventCallback(() => setAttempt((n) => n + 1));
  return { retry, state };
}

function saveText(csv: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function sectionIcon(section: ChecklistSection): {
  icon: IconSvgElement;
  tone: string;
} {
  if (section.kind === "info") {
    return { icon: InformationCircleIcon, tone: "text-muted-foreground" };
  }
  return section.rows.length > 0
    ? { icon: AlertCircleIcon, tone: "text-warning-foreground" }
    : { icon: CheckmarkCircle02Icon, tone: "text-success-foreground" };
}

function ChecklistRowItem({
  gift,
  onOpenDonor,
  onOpenGift,
  partyName,
  row,
  showNet,
  target,
}: {
  gift: ContributionRow | undefined;
  onOpenDonor: (partyId: string) => void;
  onOpenGift: (giftId: string) => void;
  partyName: string;
  row: ChecklistRow;
  showNet: boolean;
  target: ChecklistSection["target"];
}) {
  const channel = gift
    ? CONTRIBUTION_CHANNEL_LABELS[gift.channel as ContributionChannel]
    : null;
  return (
    <li
      className="flex flex-col gap-2 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
      data-testid="return-row"
    >
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{partyName}</span>
        <span className="text-muted-foreground truncate text-xs tabular-nums">
          {[
            gift ? formatReceivedOn(gift.receivedOn) : null,
            showNet
              ? `${formatPaise(row.netPaise)} net of ${formatPaise(row.refundedPaise)} refunded`
              : formatPaise(gift?.amountPaise ?? row.netPaise),
            channel,
            showNet ? null : row.note,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <div className="flex shrink-0 gap-2">
        {target === "donor" ? (
          <Button
            onClick={() => onOpenDonor(row.partyId)}
            size="sm"
            type="button"
            variant="outline"
          >
            Open donor
          </Button>
        ) : null}
        <Button
          disabled={!gift}
          onClick={() => onOpenGift(row.giftId)}
          size="sm"
          type="button"
          variant={target === "gift" ? "outline" : "ghost"}
        >
          Open gift
        </Button>
      </div>
    </li>
  );
}

function ChecklistCard({
  children,
  hasExtra = false,
  section,
}: {
  children?: ReactNode;
  /** Content beyond the rows (a link), so the card expands with no rows. */
  hasExtra?: boolean;
  section: ChecklistSection;
}) {
  const { icon, tone } = sectionIcon(section);
  const count = section.rows.length;
  const donors = donorCount(section.rows);
  const expandable = count > 0 || hasExtra;
  const countLabel =
    section.target === "donor" && count > 0
      ? `${count} ${count === 1 ? "gift" : "gifts"} · ${donors} ${donors === 1 ? "donor" : "donors"}`
      : `${count} ${count === 1 ? "gift" : "gifts"}`;
  return (
    <Collapsible
      className="rounded-lg border"
      data-testid={`return-check-${section.id}`}
    >
      <CollapsibleTrigger
        className="hover:bg-muted/40 group flex w-full items-start gap-3 rounded-lg px-4 py-3 text-left outline-none focus-visible:ring-3 disabled:cursor-default disabled:hover:bg-transparent"
        disabled={!expandable}
      >
        <HugeiconsIcon
          className={cn("mt-0.5 size-4 shrink-0", tone)}
          icon={icon}
          strokeWidth={2}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-sm font-medium">{section.title}</span>
            <span
              className="text-muted-foreground font-mono text-xs tabular-nums"
              data-testid="return-check-count"
            >
              {countLabel}
            </span>
          </span>
          <span className="text-muted-foreground text-sm text-pretty">
            {section.description}
          </span>
        </span>
        {expandable ? (
          <HugeiconsIcon
            className="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-180"
            icon={ArrowDown01Icon}
            strokeWidth={2}
          />
        ) : null}
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function DonationsReturnPage() {
  const { hasPermission } = useApp();
  const canExport = hasPermission("finance.view_sensitive");
  const canManageDonors = hasPermission("donors.manage");
  const canManageFinance = hasPermission("finance.manage");
  const [fyParam, setFyParam] = useQueryState("fy", parseAsString);
  const financialYear = fyParam ?? defaultReturnYear().label;

  const [contributions] = useQuery(queries.contribution.list());
  const [parties] = useQuery(queries.party.all());
  const giftRows = contributions as ContributionRow[];
  const partyRows = parties as PartyRow[];
  const [donorVersion, setDonorVersion] = useState(0);
  const { retry, state } = useReadiness(
    financialYear,
    `${contributionsSignature(giftRows)}|${donorVersion}`
  );

  const giftsById = new Map(giftRows.map((row) => [row.id, row]));
  const partiesById = new Map(partyRows.map((row) => [row.id, row]));

  const [viewingGiftId, setViewingGiftId] = useState<string | null>(null);
  const [editingGift, setEditingGift] = useState<ContributionRow | null>(null);
  const [viewingPartyId, setViewingPartyId] = useState<string | null>(null);
  const [editingParty, setEditingParty] = useState<PartyRow | null>(null);
  const viewingGift = viewingGiftId
    ? (giftsById.get(viewingGiftId) ?? null)
    : null;
  const viewingParty = viewingPartyId
    ? (partiesById.get(viewingPartyId) ?? null)
    : null;

  const exportFile = useServerFn(exportDonationsReturn);
  const [exporting, setExporting] = useState<"upload" | "all" | null>(null);
  const runExport = useEventCallback(async (file: "upload" | "all") => {
    setExporting(file);
    await exportFile({ data: { file, financialYear } })
      .then((result) => {
        saveText(result.csv, result.filename);
        toast.success(
          file === "upload"
            ? "Return file downloaded. Check it against the portal's template before uploading."
            : "All gifts downloaded"
        );
      })
      .catch((error: unknown) => {
        log.error({
          action: "donationsReturn.export",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "DonationsReturnPage",
        });
        toast.error("Couldn't export the donations return", {
          description:
            error instanceof Error ? error.message : "Something went wrong",
        });
      })
      .finally(() => setExporting(null));
  });
  const exportUpload = useEventCallback(() => runExport("upload"));
  const exportAll = useEventCallback(() => runExport("all"));
  const handleYear = useEventCallback((value: string | null) => {
    if (value) {
      setFyParam(value);
    }
  });

  const data = state.kind === "ready" ? state.data : null;
  const years = data?.years ?? [financialYear];
  const dueOn = data ? format(parseISO(data.dueOn), DATE) : null;
  const eligibilityReasons = new Map(
    giftRows.map((row) => [row.id, row.eligibilityReason ?? null])
  );
  const sections = data ? buildChecklist(data.gifts, eligibilityReasons) : [];
  const summary = data?.summary;
  const blockingDone = sections.filter(
    (section) => section.kind === "blocking" && section.rows.length === 0
  ).length;
  const blockingTotal = sections.filter(
    (section) => section.kind === "blocking"
  ).length;
  const readyShare =
    summary && summary.inReturnCount > 0
      ? Math.round((summary.readyCount / summary.inReturnCount) * 100)
      : 0;

  const stats: StatItem[] = summary
    ? [
        {
          description: formatPaise(summary.inReturnPaise),
          icon: Coins01Icon,
          label: "Gifts in the return",
          value: summary.inReturnCount,
        },
        {
          icon: UserLove01Icon,
          label: "Donors in the return",
          value: summary.donorCount,
        },
        {
          icon: CheckmarkCircle02Icon,
          label: "Ready",
          tone: summary.readyCount > 0 ? "success" : "neutral",
          value: summary.readyCount,
        },
        {
          icon: Alert02Icon,
          label: "Needs attention",
          tone: summary.blockedCount > 0 ? "warning" : "neutral",
          value: summary.blockedCount,
        },
        {
          description: formatPaise(summary.excludedPaise),
          icon: MinusSignCircleIcon,
          label: "Excluded",
          value: summary.excludedCount,
        },
      ]
    : [];

  const partyName = (partyId: string) =>
    partiesById.get(partyId)?.displayName ??
    giftRows.find((row) => row.partyId === partyId)?.party?.displayName ??
    "Unknown donor";

  const renderRows = (section: ChecklistSection) =>
    section.rows.length > 0 ? (
      <ul className="divide-y border-t">
        {section.rows.map((row) => (
          <ChecklistRowItem
            gift={giftsById.get(row.giftId)}
            key={`${section.id}-${row.giftId}`}
            onOpenDonor={setViewingPartyId}
            onOpenGift={setViewingGiftId}
            partyName={partyName(row.partyId)}
            row={row}
            showNet={section.showNet ?? false}
            target={section.target}
          />
        ))}
      </ul>
    ) : null;

  return (
    <div className="app-container mx-auto max-w-5xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          <>
            <Select onValueChange={handleYear} value={financialYear}>
              <SelectTrigger aria-label="Financial year" className="w-36">
                <SelectValue>{`FY ${financialYear}`}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {years.map((label) => (
                  <SelectItem key={label} value={label}>
                    {`FY ${label}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canExport ? (
              <>
                <Button
                  disabled={
                    exporting !== null ||
                    !data?.registrationReady ||
                    !data?.identifiersAvailable ||
                    (summary?.readyCount ?? 0) === 0
                  }
                  onClick={exportUpload}
                  type="button"
                >
                  <HugeiconsIcon
                    className="size-4"
                    icon={FileDownloadIcon}
                    strokeWidth={2}
                  />
                  {exporting === "upload"
                    ? "Exporting..."
                    : "Export for upload"}
                </Button>
                <PageHeaderMenu
                  actions={[
                    {
                      disabled: exporting !== null || !data,
                      icon: FileDownloadIcon,
                      id: "all-gifts",
                      label: "All gifts (for your CA)",
                      onSelect: exportAll,
                    },
                  ]}
                  title="Donations return actions"
                />
              </>
            ) : null}
          </>
        }
        description={`${RETURN_FORM_NAME} for FY ${financialYear}${dueOn ? ` · due ${dueOn}` : ""}`}
        title="Donations return"
      />

      <div className="mt-6 flex flex-col gap-6">
        <div
          className="border-warning/30 bg-warning/10 text-warning-foreground dark:bg-warning-foreground/10 rounded-md border p-3 text-sm"
          role="note"
        >
          Check the file against the portal's current Form 113 template before
          uploading.
        </div>

        {state.kind === "error" ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-destructive text-sm">
              Couldn't load the donations return.
            </p>
            <Button onClick={retry} size="sm" type="button" variant="outline">
              Try again
            </Button>
          </div>
        ) : null}

        {state.kind === "loading" ? (
          <>
            <StatsSkeleton />
            <div className="flex flex-col gap-2 rounded-lg border p-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-2 w-full" />
            </div>
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((card) => (
                <div
                  className="flex items-start gap-3 rounded-lg border px-4 py-3"
                  key={card}
                >
                  <Skeleton className="size-5 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {data && summary ? (
          <>
            <StatsCards items={stats} />

            <section
              aria-label="Progress"
              className="flex flex-col gap-2 rounded-lg border p-4"
              data-testid="return-progress"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">
                  {summary.readyCount} of {summary.inReturnCount}{" "}
                  {summary.inReturnCount === 1 ? "gift" : "gifts"} ready
                </span>
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {blockingDone}/{blockingTotal} checks clear
                </span>
              </div>
              <Progress aria-label="Gifts ready" value={readyShare} />
              <p
                className="text-muted-foreground text-sm"
                data-testid="return-export-summary"
              >
                The upload file will hold {data.exportRowCount}{" "}
                {data.exportRowCount === 1 ? "row" : "rows"} (one per donor,
                donation type and mode of receipt) totalling{" "}
                {formatPaise(summary.readyPaise)}.
              </p>
            </section>

            {data.identifiersAvailable ? null : (
              <div
                className="border-warning/30 bg-warning/10 text-warning-foreground dark:bg-warning-foreground/10 rounded-md border p-3 text-sm"
                role="status"
              >
                Identifiers unavailable (encryption key not set). ID numbers
                can't be checked or exported until an administrator sets it.
              </div>
            )}

            {data.registrationReady ? null : (
              <div
                className="border-warning/30 bg-warning/10 text-warning-foreground dark:bg-warning-foreground/10 flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                role="status"
              >
                <span>
                  The upload file needs the trust's 80G registration number
                  (URN) and its date of issue.
                </span>
                {canManageFinance ? (
                  <Button
                    render={<Link to="/settings/org-accounts" />}
                    size="sm"
                    variant="outline"
                  >
                    Add in Settings
                  </Button>
                ) : null}
              </div>
            )}

            <div className="flex flex-col gap-3">
              {sections.map((section) =>
                section.id === "waiting" ? (
                  <ChecklistCard
                    hasExtra={data.importRowsWaiting > 0}
                    key={section.id}
                    section={{
                      ...section,
                      description: `${section.description} ${data.importRowsWaiting} import ${data.importRowsWaiting === 1 ? "row is" : "rows are"} waiting.`,
                    }}
                  >
                    {renderRows(section)}
                    {data.importRowsWaiting > 0 ? (
                      <div className="border-t px-4 py-2.5">
                        <Button
                          render={
                            <Link search={{ tab: "imports" }} to="/income" />
                          }
                          size="sm"
                          variant="outline"
                        >
                          Open imports
                        </Button>
                      </div>
                    ) : null}
                  </ChecklistCard>
                ) : (
                  <ChecklistCard key={section.id} section={section}>
                    {renderRows(section)}
                  </ChecklistCard>
                )
              )}
            </div>
          </>
        ) : null}

        <p className="text-muted-foreground text-sm">
          Form 113 replaces Form 10BD from FY 2026-27; columns follow the FY
          2025-26 10BD until the new template is published.
        </p>
      </div>

      <DonorDetailSheet
        canManage={canManageDonors}
        onEdit={setEditingParty}
        onOpenChange={(open) => {
          if (!open) {
            setViewingPartyId(null);
          }
        }}
        open={viewingParty !== null}
        party={viewingParty}
        version={donorVersion}
      />
      <DonorFormDialog
        onOpenChange={(open) => {
          if (!open) {
            setEditingParty(null);
          }
        }}
        onSaved={() => setDonorVersion((n) => n + 1)}
        open={editingParty !== null}
        party={editingParty}
      />
      <ContributionDetailSheet
        // Deleting stays on the Income page.
        canDelete={false}
        canEdit={
          canManageDonors &&
          viewingGift !== null &&
          isContributionEditable(viewingGift.status ?? "received")
        }
        contribution={viewingGift}
        onDelete={() => undefined}
        onEdit={setEditingGift}
        onOpenChange={(open) => {
          if (!open) {
            setViewingGiftId(null);
          }
        }}
      />
      <ContributionFormDialog
        contribution={editingGift}
        onOpenChange={(open) => {
          if (!open) {
            setEditingGift(null);
          }
        }}
        open={editingGift !== null}
      />
    </div>
  );
}
