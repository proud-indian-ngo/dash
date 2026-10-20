import {
  ArrowDown01Icon,
  CalendarSetting01Icon,
  CheckmarkCircle02Icon,
  Edit02Icon,
  Delete02Icon,
  PlusSignIcon,
  Undo02Icon,
  UserAccountIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@pi-dash/design-system/components/ui/collapsible";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { Switch } from "@pi-dash/design-system/components/ui/switch";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import {
  COMPLIANCE_STATUS_LABELS,
  type ComplianceItemStatus,
} from "@pi-dash/shared/compliance";
import {
  daysBetween,
  GOVERNANCE_PAGE_PERMISSIONS,
} from "@pi-dash/shared/governance";
import { financialYearOf } from "@pi-dash/shared/income";
import {
  ANNUAL_PACK_TEMPLATES,
  type ResolutionTemplateKey,
} from "@pi-dash/shared/resolutions";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { useState } from "react";
import { uuidv7 } from "uuidv7";

import {
  AddItemDialog,
  AssignDialog,
  MarkDoneDialog,
  NotNeededDialog,
} from "@/components/governance/compliance-dialogs";
import { EvidenceLink } from "@/components/governance/evidence";
import { PlainSelect } from "@/components/governance/plain-select";
import {
  epochToIso,
  formatIso,
  isoToDate,
  todayIso,
  useGovernanceDocuments,
} from "@/components/governance/register-data";
import { useAccountOptions } from "@/components/governance/use-account-options";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { RowActionsButton } from "@/components/shared/row-actions-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatsCards } from "@/components/stats/stats-cards";
import { useApp } from "@/context/app-context";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";
import { assertAnyPermission } from "@/lib/route-guards";
import { preloadRouteQuery } from "@/lib/route-preload";

export const Route = createFileRoute("/_app/governance/compliance")({
  beforeLoad: ({ context }) =>
    assertAnyPermission(context, ...GOVERNANCE_PAGE_PERMISSIONS),
  component: CompliancePage,
  head: () => ({
    meta: [{ title: `Compliance calendar | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context }) => {
    preloadRouteQuery(
      context.zero,
      queries.compliance.items(),
      abortController.signal
    );
  },
});

type Filter = "open" | "closed" | "all";

interface Item {
  dueOn: string;
  evidenceDocumentId: string | null;
  id: string;
  note: string | null;
  ownerUserId: string | null;
  /** The annual-pack resolution template this item is closed by, if any. */
  resolutionTemplate: ResolutionTemplateKey | null;
  status: ComplianceItemStatus;
  title: string;
}

type Dialogs =
  | { kind: "close"; item: Item }
  | { kind: "waive"; item: Item }
  | { kind: "assign"; item: Item }
  | { kind: "add" }
  | { kind: "templates" }
  | null;

/** Open items within this many days count as due soon. */
const DUE_SOON_DAYS = 30;

/** How far off an open item is; a closed one says how it closed. */
function dueBadge(item: Item, today: string) {
  if (item.status !== "open") {
    return (
      <StatusBadge tone={item.status === "done" ? "success" : "neutral"}>
        {COMPLIANCE_STATUS_LABELS[item.status]}
      </StatusBadge>
    );
  }
  const days = daysBetween(today, item.dueOn);
  if (days < 0) {
    return (
      <StatusBadge tone="danger">
        {days === -1 ? "1 day late" : `${-days} days late`}
      </StatusBadge>
    );
  }
  if (days > DUE_SOON_DAYS) {
    return null;
  }
  let label = `Due in ${days} days`;
  if (days === 0) {
    label = "Due today";
  } else if (days === 1) {
    label = "Due tomorrow";
  }
  return <StatusBadge tone="warning">{label}</StatusBadge>;
}

function monthLabel(month: string) {
  return format(isoToDate(`${month}-01`) ?? new Date(), "MMMM yyyy");
}

function byMonth(items: Item[]) {
  const months = new Map<string, Item[]>();
  for (const item of items) {
    const key = item.dueOn.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), item]);
  }
  return [...months.entries()];
}

function ItemGroup({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="divide-y rounded-md border">{children}</div>
    </section>
  );
}

function CompliancePage() {
  const { hasPermission } = useApp();
  const canManage = hasPermission("governance.manage");
  const zero = useZero();
  const [rows, result] = useQuery(queries.compliance.items());
  const [templates] = useQuery(queries.compliance.templates());
  const navigate = useNavigate();
  const templateKeys = new Map(templates.map((t) => [t.id, t.key]));
  const { documents } = useGovernanceDocuments();
  const owners = useAccountOptions(canManage);
  const ownerName = (id: string | null) =>
    id ? (owners.find((o) => o.id === id)?.name ?? "Assigned") : "Secretaries";
  const [filter, setFilter] = useState<Filter>("open");
  const [dialog, setDialog] = useState<Dialogs>(null);
  const today = todayIso();
  const isLoading = rows.length === 0 && result.type !== "complete";

  const items: Item[] = rows.map((r) => ({
    dueOn: epochToIso(r.dueOn),
    evidenceDocumentId: r.evidenceDocumentId ?? null,
    id: r.id,
    note: r.note ?? null,
    ownerUserId: r.ownerUserId ?? null,
    resolutionTemplate:
      ANNUAL_PACK_TEMPLATES[templateKeys.get(r.templateId ?? "") ?? ""] ?? null,
    status: r.status ?? "open",
    title: r.title,
  }));
  const shown = items.filter((i) =>
    filter === "all"
      ? true
      : filter === "open"
        ? i.status === "open"
        : i.status !== "open"
  );
  const open = items.filter((i) => i.status === "open");
  const overdue = open.filter((i) => i.dueOn < today);
  const dueSoon = open.filter(
    (i) => i.dueOn >= today && daysBetween(today, i.dueOn) <= DUE_SOON_DAYS
  );
  const later = open.filter((i) => daysBetween(today, i.dueOn) > DUE_SOON_DAYS);
  const year = financialYearOf(today);
  const closedThisYear = items.filter(
    (i) =>
      i.status !== "open" && i.dueOn >= year.startsOn && i.dueOn <= year.endsOn
  ).length;

  const mutate = useEventCallback(
    async (
      pending: Promise<{ error?: unknown; type: string }>,
      entityId: string,
      mutation: string,
      success: string
    ) => {
      const out = await pending;
      handleMutationResult(out, {
        entityId,
        errorMsg: `Couldn't save: ${getMutationResultErrorMessage(out.type === "error" ? out.error : undefined, "something went wrong")}`,
        mutation,
        successMsg: success,
      });
      if (out.type !== "error") {
        setDialog(null);
      }
    }
  );

  const closeDialog = useEventCallback(() => setDialog(null));

  const renderItem = (item: Item) => (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
      data-testid={`compliance-item-${item.id}`}
      key={item.id}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{item.title}</p>
        <p className="text-muted-foreground text-xs">
          Due {formatIso(item.dueOn)} · {ownerName(item.ownerUserId)}
          {item.note ? ` · ${item.note}` : ""}
        </p>
      </div>
      {item.evidenceDocumentId ? (
        <EvidenceLink
          documentId={item.evidenceDocumentId}
          documents={documents}
        />
      ) : null}
      {dueBadge(item, today)}
      {canManage ? (
        <ResponsiveActionMenu
          actions={[
            item.status === "open" && {
              icon: CheckmarkCircle02Icon,
              id: "close",
              label: "Mark done",
              onSelect: () => setDialog({ item, kind: "close" }),
            },
            item.status === "open" &&
              item.resolutionTemplate && {
                icon: Edit02Icon,
                id: "draft",
                label: "Draft the resolution",
                onSelect: () =>
                  navigate({
                    search: {
                      template: item.resolutionTemplate ?? undefined,
                    },
                    to: "/governance/resolutions",
                  }),
              },
            item.status === "open" && {
              icon: UserAccountIcon,
              id: "assign",
              label: "Assign",
              onSelect: () => setDialog({ item, kind: "assign" }),
            },
            item.status !== "open" && {
              icon: Undo02Icon,
              id: "reopen",
              label: "Reopen",
              onSelect: () =>
                mutate(
                  zero.mutate(mutators.complianceItem.reopen({ id: item.id }))
                    .server,
                  item.id,
                  "complianceItem.reopen",
                  "Reopened"
                ),
            },
            item.status === "open" && {
              destructive: true,
              icon: Delete02Icon,
              id: "waive",
              label: "Not needed",
              onSelect: () => setDialog({ item, kind: "waive" }),
            },
          ]}
          title={`${item.title} actions`}
          trigger={<RowActionsButton />}
        />
      ) : null}
    </div>
  );

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          canManage ? (
            <>
              <Button onClick={() => setDialog({ kind: "add" })} type="button">
                <HugeiconsIcon
                  className="size-4"
                  icon={PlusSignIcon}
                  strokeWidth={2}
                />
                Add item
              </Button>
              <PageHeaderMenu
                actions={[
                  {
                    icon: CalendarSetting01Icon,
                    id: "templates",
                    label: "Recurring items",
                    onSelect: () => setDialog({ kind: "templates" }),
                  },
                ]}
                title="Calendar actions"
              />
            </>
          ) : null
        }
        description="Filings, renewals and Board approvals that fall due each year. An item closes only with the filing or record that proves it, from the Documents vault."
        title="Compliance calendar"
      />
      <StatsCards
        className="mt-6"
        items={[
          {
            label: "Overdue",
            tone: overdue.length > 0 ? "danger" : "neutral",
            value: overdue.length,
          },
          {
            label: `Due in ${DUE_SOON_DAYS} days`,
            tone: dueSoon.length > 0 ? "warning" : "neutral",
            value: dueSoon.length,
          },
          { label: "Later", value: later.length },
          { label: `Closed in ${year.label}`, value: closedThisYear },
        ]}
      />
      <Tabs
        className="mt-6 border-b"
        onValueChange={(value) => setFilter(value as Filter)}
        value={filter}
      >
        <TabsList className="h-9 gap-4 px-0" variant="line">
          {(
            [
              ["open", "Open", open.length],
              ["closed", "Closed", items.length - open.length],
              ["all", "All", items.length],
            ] as const
          ).map(([value, label, count]) => (
            <TabsTrigger className="flex-none px-0" key={value} value={value}>
              {label}
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {count}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="mt-4 flex flex-col gap-6">
        {isLoading ? <Skeleton className="h-24 w-full" /> : null}
        {!isLoading && shown.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing here.</p>
        ) : null}
        {filter === "open" ? (
          <>
            {overdue.length > 0 ? (
              <ItemGroup title="Overdue">{overdue.map(renderItem)}</ItemGroup>
            ) : null}
            {dueSoon.length > 0 ? (
              <ItemGroup title={`Next ${DUE_SOON_DAYS} days`}>
                {dueSoon.map(renderItem)}
              </ItemGroup>
            ) : null}
            {later.length > 0 ? (
              <ItemGroup title="Later">
                {byMonth(later).map(([month, monthItems]) => (
                  <Collapsible key={month}>
                    <CollapsibleTrigger className="hover:bg-muted/40 group flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm outline-none focus-visible:ring-3">
                      <span>
                        {monthLabel(month)} · {monthItems.length}{" "}
                        {monthItems.length === 1 ? "item" : "items"}
                      </span>
                      <HugeiconsIcon
                        className="text-muted-foreground size-4 transition-transform group-data-[panel-open]:rotate-180"
                        icon={ArrowDown01Icon}
                        strokeWidth={2}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="divide-y border-t">
                      {monthItems.map(renderItem)}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </ItemGroup>
            ) : null}
          </>
        ) : (
          byMonth(shown).map(([month, monthItems]) => (
            <ItemGroup key={month} title={monthLabel(month)}>
              {monthItems.map(renderItem)}
            </ItemGroup>
          ))
        )}
      </div>

      <MarkDoneDialog
        documents={documents}
        item={dialog?.kind === "close" ? dialog.item : null}
        onClose={closeDialog}
        onSubmit={(item, documentId, note) =>
          mutate(
            zero.mutate(
              mutators.complianceItem.close({
                evidenceDocumentId: documentId,
                id: item.id,
                note: note || null,
              })
            ).server,
            item.id,
            "complianceItem.close",
            "Marked done"
          )
        }
      />
      <NotNeededDialog
        item={dialog?.kind === "waive" ? dialog.item : null}
        onClose={closeDialog}
        onSubmit={(item, reason) =>
          mutate(
            zero.mutate(
              mutators.complianceItem.waive({ id: item.id, note: reason })
            ).server,
            item.id,
            "complianceItem.waive",
            "Marked not needed"
          )
        }
      />
      <AssignDialog
        item={dialog?.kind === "assign" ? dialog.item : null}
        onClose={closeDialog}
        onSubmit={(item, ownerUserId) =>
          mutate(
            zero.mutate(
              mutators.complianceItem.assign({ id: item.id, ownerUserId })
            ).server,
            item.id,
            "complianceItem.assign",
            "Assigned"
          )
        }
        owners={owners}
      />
      <AddItemDialog
        onClose={closeDialog}
        onSubmit={(title, dueOn) => {
          const id = uuidv7();
          return mutate(
            zero.mutate(mutators.complianceItem.create({ dueOn, id, title }))
              .server,
            id,
            "complianceItem.create",
            "Item added"
          );
        }}
        open={dialog?.kind === "add"}
      />
      <Dialog
        onOpenChange={(open) => !open && setDialog(null)}
        open={dialog?.kind === "templates"}
      >
        <DialogContent className="sm:max-w-(--dialog-lg)">
          <DialogHeader>
            <DialogTitle>Recurring items</DialogTitle>
            <DialogDescription>
              Turn an item off if it doesn't apply, and choose who it goes to.
              New occurrences are added every night.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col divide-y">
            {templates.map((template) => (
              <div
                className="flex flex-wrap items-center gap-3 py-3"
                key={template.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{template.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {template.description}
                  </p>
                </div>
                <PlainSelect
                  className="w-48"
                  label={`Owner of ${template.title}`}
                  onChange={(next) =>
                    mutate(
                      zero.mutate(
                        mutators.complianceTemplate.update({
                          active: template.active ?? true,
                          id: template.id,
                          ownerUserId: next || null,
                        })
                      ).server,
                      template.id,
                      "complianceTemplate.update",
                      "Saved"
                    )
                  }
                  options={[
                    { label: "Secretaries", value: "" },
                    ...owners.map((o) => ({ label: o.name, value: o.id })),
                  ]}
                  value={template.ownerUserId ?? ""}
                />
                <Switch
                  aria-label={`${template.title} on`}
                  checked={template.active ?? true}
                  onCheckedChange={(active) =>
                    mutate(
                      zero.mutate(
                        mutators.complianceTemplate.update({
                          active,
                          id: template.id,
                          ownerUserId: template.ownerUserId ?? null,
                        })
                      ).server,
                      template.id,
                      "complianceTemplate.update",
                      active ? "Turned on" : "Turned off"
                    )
                  }
                />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
