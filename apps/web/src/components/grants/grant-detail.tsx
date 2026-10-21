import {
  CheckmarkCircle02Icon,
  Delete02Icon,
  LinkSquare02Icon,
  MoneyReceive01Icon,
  MoneySend01Icon,
  PiggyBankIcon,
  Unlink02Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { budgetableHeadIds } from "@pi-dash/shared/budgets";
import type { GrantStatus } from "@pi-dash/shared/constants";
import {
  GRANT_STATUS_LABELS,
  grantTranches,
  grantUtilisation,
} from "@pi-dash/shared/grants";
import {
  DONATION_TYPE_LABELS,
  epochDayToIso,
  netReceivedPaise,
  todayInKolkata,
} from "@pi-dash/shared/income";
import { formatPaise } from "@pi-dash/shared/money";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type {
  Contribution,
  ContributionRefund,
  GrantAgreement,
  GrantBudgetLine,
  GrantTranche,
  Party,
  Programme,
  Project,
} from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { Remaining, SpentBar } from "@/components/budgets/budgets-table";
import { DateField } from "@/components/form/date-field";
import { formatReceivedOn } from "@/components/income/income-date";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
import {
  DetailsCard,
  DetailsRow,
  RecordDetailLayout,
  RecordSection,
} from "@/components/shared/record-detail";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { RowActionsButton } from "@/components/shared/row-actions-button";
import { StatusBadge, Tag } from "@/components/shared/status-badge";
import { StatsCards } from "@/components/stats/stats-cards";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { DATE } from "@/lib/date-formats";
import { localDateToIso } from "@/lib/local-date";
import { handleMutationResult } from "@/lib/mutation-result";

import { GrantAgreementFile } from "./grant-agreement-file";
import { GrantBudgetDialog } from "./grant-budget-dialog";
import { GRANT_LAST_MONTH } from "./grant-dates";
import { type EditableGrant, GrantFormDialog } from "./grant-form-dialog";
import { GrantTranchesDialog } from "./grant-tranches-dialog";
import { useGrantUtilisation } from "./use-grant-utilisation";

/** A grant as `grant.byId` returns it. */
export type GrantRecord = GrantAgreement & {
  budgetLines: readonly GrantBudgetLine[];
  contributions: readonly (Contribution & {
    refunds: readonly ContributionRefund[];
  })[];
  party?: Party | null;
  programme?: Programme | null;
  project?: Project | null;
  tranches: readonly GrantTranche[];
};

const isoToDisplay = (iso: string) => format(parseISO(iso), DATE);

/** One framed list, as detail pages use for lists inside a page. */
function FramedList({
  children,
  testId,
}: {
  children: ReactNode;
  testId: string;
}) {
  return (
    <ul className="divide-y rounded-lg border" data-testid={testId}>
      {children}
    </ul>
  );
}

function Line({
  label,
  sub,
  value,
}: {
  label: ReactNode;
  sub?: ReactNode;
  value: ReactNode;
}) {
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm">
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{label}</span>
        {sub ? (
          <span className="text-muted-foreground truncate text-xs">{sub}</span>
        ) : null}
      </span>
      <span className="shrink-0 font-mono tabular-nums">{value}</span>
    </li>
  );
}

const muted = (text: string) => (
  <p className="text-muted-foreground rounded-lg border px-3 py-3 text-sm">
    {text}
  </p>
);

export function GrantDetail({
  canManage,
  grant,
}: {
  canManage: boolean;
  grant: GrantRecord;
}) {
  const zero = useZero();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [editingTranches, setEditingTranches] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const [heads] = useQuery(queries.accountHead.all());
  const [categories] = useQuery(queries.expenseCategory.all());

  // By default the whole grant: everything recorded up to its end, or up
  // to today once it has ended (money can still arrive late).
  const today = todayInKolkata();
  const endIso = epochDayToIso(grant.endsOn);
  const defaultTo = today > endIso ? today : endIso;
  const rangeForm = useForm({
    defaultValues: {
      from: undefined as Date | undefined,
      to: undefined as Date | undefined,
    },
  });
  const [range, setRange] = useState<{ from: string | null; to: string }>({
    from: null,
    to: defaultTo,
  });
  const { error, retry, rows } = useGrantUtilisation({
    from: range.from,
    grantId: grant.id,
    to: range.to,
  });

  const deleteAction = useConfirmAction({
    mutationMeta: {
      entityId: grant.id,
      errorMsg: "Couldn't delete the grant",
      mutation: "grant.delete",
      successMsg: "Grant deleted",
    },
    onConfirm: () =>
      zero.mutate(mutators.grant.delete({ id: grant.id })).server,
    onSuccess: () => navigate({ to: "/finance/grants" }),
  });

  const status = grant.status as GrantStatus;
  const setStatus = async (next: GrantStatus) => {
    const res = await zero.mutate(
      mutators.grant.save({
        agreementOn: grant.agreementOn
          ? epochDayToIso(grant.agreementOn)
          : null,
        agreementReference: grant.agreementReference ?? null,
        donationType: grant.donationType as "csr" | "specific_grant",
        endsOn: endIso,
        id: grant.id,
        notes: grant.notes ?? null,
        partyId: grant.partyId,
        programmeId: grant.programmeId,
        projectId: grant.projectId,
        sanctionedPaise: grant.sanctionedPaise,
        scheduleViiItem: grant.scheduleViiItem ?? null,
        startsOn: epochDayToIso(grant.startsOn),
        status: next,
        title: grant.title,
      })
    ).server;
    handleMutationResult(res, {
      entityId: grant.id,
      errorMsg: "Couldn't change the grant's status",
      mutation: "grant.save",
      successMsg: next === "closed" ? "Grant closed" : "Grant reopened",
    });
  };
  const unlink = async (contributionId: string) => {
    const res = await zero.mutate(
      mutators.grant.linkContribution({
        contributionId,
        grantId: null,
        trancheId: null,
      })
    ).server;
    handleMutationResult(res, {
      entityId: contributionId,
      errorMsg: "Couldn't unlink the contribution",
      mutation: "grant.linkContribution",
      successMsg: "Contribution unlinked",
    });
    if (res.type !== "error") {
      retry();
    }
  };

  const headNames = new Map(heads.map((h) => [h.id, h.name]));
  const budgetable = budgetableHeadIds(categories, heads);
  const held = new Set(grant.budgetLines.map((l) => l.accountHeadId));
  const budgetHeads = heads
    .filter((h) => (budgetable.has(h.id) && h.active) || held.has(h.id))
    .map((h) => ({ id: h.id, name: h.name }));

  const utilisation = rows
    ? grantUtilisation({
        budgetLines: grant.budgetLines,
        from: range.from,
        receipts: rows.receipts,
        spend: rows.spend,
      })
    : null;
  // Live from Zero, so a tranche edit or a new link shows at once.
  const tranches = grantTranches(
    grant.tranches.map((t) => ({
      amountPaise: t.amountPaise,
      expectedOn: epochDayToIso(t.expectedOn),
      id: t.id,
      note: t.note ?? null,
    })),
    grant.contributions.map((c) => ({
      paise: netReceivedPaise(c),
      trancheId: c.grantTrancheId ?? null,
    }))
  );
  const trancheLabel = new Map(
    [...grant.tranches]
      .sort((a, b) => a.expectedOn - b.expectedOn)
      .map((t, i) => [t.id, `Tranche ${i + 1}`])
  );
  const toLabel = isoToDisplay(range.to);
  const periodLabel = range.from
    ? `${isoToDisplay(range.from)} to ${toLabel}`
    : `Start to ${toLabel}`;

  const programmeName = grant.programme?.name ?? "Programme";
  const projectName = grant.project?.name ?? "Project";

  return (
    <>
      <PageHeader
        actions={
          canManage ? (
            <>
              <Button
                onClick={() => setEditing(true)}
                type="button"
                variant="outline"
              >
                Edit grant
              </Button>
              <PageHeaderMenu
                actions={[
                  status === "active"
                    ? {
                        icon: CheckmarkCircle02Icon,
                        id: "close",
                        label: "Close grant",
                        onSelect: () => setStatus("closed"),
                      }
                    : {
                        icon: LinkSquare02Icon,
                        id: "reopen",
                        label: "Reopen grant",
                        onSelect: () => setStatus("active"),
                      },
                  grant.contributions.length === 0
                    ? {
                        destructive: true,
                        icon: Delete02Icon,
                        id: "delete",
                        label: "Delete grant",
                        onSelect: () => deleteAction.trigger(),
                      }
                    : null,
                ]}
                title="Grant actions"
              />
            </>
          ) : null
        }
        badge={
          <StatusBadge tone={status === "active" ? "success" : "neutral"}>
            {GRANT_STATUS_LABELS[status]}
          </StatusBadge>
        }
        meta={[
          grant.party?.displayName ?? "Grantor",
          `${projectName} · ${programmeName}`,
          `${formatReceivedOn(grant.startsOn)} – ${formatReceivedOn(grant.endsOn)}`,
        ]}
        title={grant.title}
      />
      <div className="mt-6">
        <RecordDetailLayout
          aside={
            <DetailsCard>
              <DetailsRow label="Grantor">
                {grant.party?.displayName ?? "—"}
              </DetailsRow>
              <DetailsRow label="Donation type">
                {DONATION_TYPE_LABELS[grant.donationType as "csr"]}
              </DetailsRow>
              <DetailsRow label="Programme">{programmeName}</DetailsRow>
              <DetailsRow label="Project">{projectName}</DetailsRow>
              <DetailsRow label="Sanctioned">
                {formatPaise(grant.sanctionedPaise)}
              </DetailsRow>
              <DetailsRow label="Reference">
                {grant.agreementReference ?? "—"}
              </DetailsRow>
              <DetailsRow label="Agreement date">
                {grant.agreementOn ? formatReceivedOn(grant.agreementOn) : "—"}
              </DetailsRow>
              <DetailsRow label="Agreement">
                <GrantAgreementFile canManage={canManage} grant={grant} />
              </DetailsRow>
              {grant.scheduleViiItem ? (
                <DetailsRow label="Schedule VII">
                  {grant.scheduleViiItem}
                </DetailsRow>
              ) : null}
              {grant.notes ? (
                <DetailsRow label="Notes">{grant.notes}</DetailsRow>
              ) : null}
            </DetailsCard>
          }
        >
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const values = rangeForm.state.values;
              const from = localDateToIso(values.from);
              const to = localDateToIso(values.to) ?? defaultTo;
              if (from && from > to) {
                toast.error("The period ends before it starts");
                return;
              }
              setRange({ from, to });
            }}
          >
            <div className="w-44">
              <DateField
                endMonth={GRANT_LAST_MONTH}
                form={rangeForm}
                label="From"
                name="from"
                placeholder="Grant start"
              />
            </div>
            <div className="w-44">
              <DateField
                form={rangeForm}
                endMonth={GRANT_LAST_MONTH}
                label="To"
                name="to"
                placeholder={isoToDisplay(defaultTo)}
              />
            </div>
            <Button type="submit" variant="outline">
              Show period
            </Button>
          </form>
          {error ? (
            <ErrorState
              actions={
                <Button onClick={retry} type="button">
                  Try again
                </Button>
              }
              error={error}
            />
          ) : (
            <>
              <StatsCards
                isLoading={utilisation === null}
                items={[
                  {
                    icon: Wallet01Icon,
                    label: "Sanctioned",
                    value: formatPaise(grant.sanctionedPaise),
                  },
                  {
                    icon: MoneyReceive01Icon,
                    label: "Received",
                    value: formatPaise(utilisation?.toDate.receivedPaise ?? 0),
                  },
                  {
                    icon: MoneySend01Icon,
                    label: "Spent",
                    value: formatPaise(utilisation?.toDate.spentPaise ?? 0),
                  },
                  {
                    icon: PiggyBankIcon,
                    label: "Unspent",
                    tone:
                      (utilisation?.toDate.unspentPaise ?? 0) < 0
                        ? "danger"
                        : "neutral",
                    value: formatPaise(utilisation?.toDate.unspentPaise ?? 0),
                  },
                ]}
              />
              {utilisation ? (
                <RecordSection title={`Utilisation · ${periodLabel}`}>
                  <FramedList testId="grant-utilisation">
                    <Line
                      label="Unspent brought forward"
                      value={formatPaise(utilisation.broughtForwardPaise)}
                    />
                    <Line
                      label="Received"
                      sub={`${utilisation.received.length} contribution${utilisation.received.length === 1 ? "" : "s"}`}
                      value={formatPaise(utilisation.receivedPaise)}
                    />
                    <Line
                      label="Spent"
                      value={formatPaise(utilisation.spentPaise)}
                    />
                    <Line
                      label="Closing unspent"
                      value={
                        <span
                          className={
                            utilisation.closingPaise < 0
                              ? "text-destructive"
                              : ""
                          }
                        >
                          {formatPaise(utilisation.closingPaise)}
                        </span>
                      }
                    />
                  </FramedList>
                </RecordSection>
              ) : null}
            </>
          )}

          <RecordSection
            action={
              canManage ? (
                <Button
                  onClick={() => setEditingTranches(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Edit tranches
                </Button>
              ) : null
            }
            title="Tranches"
          >
            {grant.tranches.length === 0 ? (
              muted("No tranches are scheduled.")
            ) : (
              <FramedList testId="grant-tranches">
                {tranches.tranches.map((t, i) => (
                  <Line
                    key={t.id}
                    label={
                      <>
                        {`Tranche ${i + 1} · ${isoToDisplay(t.expectedOn)}`}
                        {t.receivedPaise >= t.amountPaise ? (
                          <Tag className="ml-2">Received</Tag>
                        ) : t.receivedPaise > 0 ? (
                          <Tag className="ml-2">Part received</Tag>
                        ) : null}
                      </>
                    }
                    sub={t.note ?? undefined}
                    value={`${formatPaise(t.receivedPaise)} of ${formatPaise(t.amountPaise)}`}
                  />
                ))}
                {tranches.unscheduledPaise > 0 ? (
                  <Line
                    label="Received without a tranche"
                    value={formatPaise(tranches.unscheduledPaise)}
                  />
                ) : null}
              </FramedList>
            )}
          </RecordSection>

          <RecordSection
            action={
              canManage ? (
                <Button
                  onClick={() => setEditingBudget(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Edit budget
                </Button>
              ) : null
            }
            title={`Spend by head · ${periodLabel}`}
          >
            {utilisation && utilisation.heads.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm" data-testid="grant-heads">
                  <thead className="text-muted-foreground text-xs">
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left font-medium">Head</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Budget
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        In period
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        To date
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Remaining
                      </th>
                      <th className="px-3 py-2 font-medium">Used</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y font-mono tabular-nums">
                    {utilisation.heads.map((h) => (
                      <tr data-testid="grant-head" key={h.accountHeadId}>
                        <td className="px-3 py-2 font-sans">
                          {headNames.get(h.accountHeadId) ?? "Account head"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {h.budgetPaise === null
                            ? "—"
                            : formatPaise(h.budgetPaise)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {formatPaise(h.periodPaise)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {formatPaise(h.toDatePaise)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Remaining
                            actualPaise={h.toDatePaise}
                            budgetPaise={h.budgetPaise}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <SpentBar
                            actualPaise={h.toDatePaise}
                            budgetPaise={h.budgetPaise}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              muted("No budget or spending on this project yet.")
            )}
          </RecordSection>

          <RecordSection
            title={`Contributions (${grant.contributions.length})`}
          >
            {grant.contributions.length === 0 ? (
              muted(
                "No contributions are linked yet. Link one from its sheet on the Income page."
              )
            ) : (
              <FramedList testId="grant-contributions">
                {grant.contributions.map((c) => (
                  <li
                    className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm"
                    key={c.id}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">
                        {formatReceivedOn(c.receivedOn)}
                        {c.grantTrancheId
                          ? ` · ${trancheLabel.get(c.grantTrancheId) ?? "Tranche"}`
                          : ""}
                      </span>
                      <span className="text-muted-foreground truncate text-xs">
                        {c.reference ?? "No reference"}
                        {c.status === "pending" ? " · Pending" : ""}
                        {c.status === "reversed" ? " · Reversed" : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="font-mono tabular-nums">
                        {formatPaise(netReceivedPaise(c))}
                      </span>
                      {canManage ? (
                        <ResponsiveActionMenu
                          actions={[
                            {
                              icon: Unlink02Icon,
                              id: "unlink",
                              label: "Unlink from grant",
                              onSelect: () => unlink(c.id),
                            },
                          ]}
                          title="Contribution actions"
                          trigger={<RowActionsButton />}
                        />
                      ) : null}
                    </span>
                  </li>
                ))}
              </FramedList>
            )}
          </RecordSection>
        </RecordDetailLayout>
      </div>

      <GrantFormDialog
        grant={editing ? (grant as EditableGrant) : null}
        onOpenChange={setEditing}
        open={editing}
      />
      <GrantTranchesDialog
        grantId={grant.id}
        onOpenChange={setEditingTranches}
        open={editingTranches}
        tranches={grant.tranches}
      />
      <GrantBudgetDialog
        grantId={grant.id}
        heads={budgetHeads}
        lines={grant.budgetLines}
        onOpenChange={setEditingBudget}
        open={editingBudget}
        sanctionedPaise={grant.sanctionedPaise}
      />
      <ConfirmDialog
        confirmLabel="Delete grant"
        description="Its tranches, budget and agreement file go with it. Nothing in the books changes."
        loading={deleteAction.isLoading}
        onConfirm={deleteAction.confirm}
        onOpenChange={(open) => {
          if (!open) {
            deleteAction.cancel();
          }
        }}
        open={deleteAction.isOpen}
        title="Delete grant?"
        variant="destructive"
      />
    </>
  );
}
