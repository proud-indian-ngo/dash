import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  AUDITED_REASON_MAX,
  AUDITED_REASON_MIN,
  type AuditedPlan,
  type AddedLineInput,
  type BalanceSheetLine,
  type CounterHeadType,
  type FundTransferInput,
  type PlanLine,
  booksChangedSince,
  buildAuditedPayload,
  planAuditedFigures,
} from "@pi-dash/shared/audited-figures";
import {
  formatPaise,
  RUPEES_INPUT_MESSAGE,
  tryRupeesToPaise,
} from "@pi-dash/shared/money";
import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { CheckboxField } from "@/components/form/checkbox-field";
import { ComboboxField } from "@/components/form/combobox-field";
import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField, type SelectOption } from "@/components/form/select-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { postAuditedFiguresFn } from "@/functions/books";
import { ISO_DATE } from "@/lib/date-formats";

/**
 * The audited figures of one ended year (the year-end true-up): every
 * balance sheet line the books hold at 31 March beside an input for the
 * signed statements' figure, typed in by the treasurer, never pre-filled.
 * The difference and how it posts show live: money accounts must agree
 * (a difference means records are missing), a fixed asset carried at less
 * is depreciation, every other difference a year-end adjustment unless
 * another head is picked, and the funds are checked once those flow into
 * the General Fund. It posts as one posting dated the year's last day.
 */

export interface AuditedFormLine extends BalanceSheetLine {
  /** The account's cash book and, for a bank account, its statements. */
  accountKind?: string;
  label: string;
}

export interface HeadOption {
  id: string;
  name: string;
  type: string;
}

const optionalAmount = z
  .string()
  .trim()
  .refine(
    (value) => !value || tryRupeesToPaise(value) !== null,
    RUPEES_INPUT_MESSAGE
  );

const schema = z.object({
  added: z.array(
    z
      .object({
        accountHeadId: z.string().optional(),
        amount: optionalAmount,
        counterHeadId: z.string().optional(),
        key: z.string(),
        kind: z.enum(["asset", "liability"]),
        memo: z.string().trim().max(120),
      })
      .refine((line) => Boolean(line.accountHeadId), {
        message: "Pick the line's head",
        path: ["accountHeadId"],
      })
      .refine((line) => Boolean(line.amount.trim()), {
        message: "Enter the audited figure",
        path: ["amount"],
      })
  ),
  caConfirmed: z
    .boolean()
    .refine(Boolean, "Confirm these are the CA's signed figures"),
  caName: z
    .string()
    .trim()
    .min(1, "Enter the chartered accountant's name")
    .max(120),
  lines: z.array(
    z.object({
      amount: optionalAmount,
      counterHeadId: z.string().optional(),
      key: z.string(),
    })
  ),
  signedOn: z
    .date()
    .optional()
    .refine(
      (value) => value !== undefined,
      "Pick the date the CA signed the statements"
    ),
  transfers: z.array(
    z.object({
      amount: optionalAmount.refine(
        (value) => (tryRupeesToPaise(value || "0") ?? 0) > 0,
        "Enter the amount moved"
      ),
      fromFundId: z.string().optional(),
      key: z.string(),
      reason: z
        .string()
        .trim()
        .min(AUDITED_REASON_MIN, "Say why the CA moved it")
        .max(AUDITED_REASON_MAX),
      toFundId: z.string().optional(),
    })
  ),
});

type FormValues = z.input<typeof schema>;

const paiseOrNull = (amount: string) => {
  const trimmed = amount.trim();
  return trimmed ? tryRupeesToPaise(trimmed) : null;
};

interface PlanInputs {
  added: AddedLineInput[];
  audited: {
    auditedPaise: number | null;
    counterHeadId: string | null;
    key: string;
  }[];
  transfers: FundTransferInput[];
}

function planInputs(
  values: Pick<FormValues, "added" | "lines" | "transfers">
): PlanInputs {
  return {
    added: values.added.map((a) => ({
      accountHeadId: a.accountHeadId ?? "",
      auditedPaise: paiseOrNull(a.amount),
      counterHeadId: a.counterHeadId ?? null,
      kind: a.kind,
      memo: a.memo.trim() || null,
    })),
    audited: values.lines.map((l) => ({
      auditedPaise: paiseOrNull(l.amount),
      counterHeadId: l.counterHeadId ?? null,
      key: l.key,
    })),
    transfers: values.transfers.map((t) => ({
      amountPaise: tryRupeesToPaise(t.amount.trim() || "0") ?? 0,
      fromFundId: t.fromFundId ?? "",
      reason: t.reason,
      toFundId: t.toFundId ?? "",
    })),
  };
}

const signed = (paise: number) =>
  `${paise > 0 ? "+" : ""}${formatPaise(paise)}`;

function Group({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section aria-label={title} className="grid gap-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

const ROW =
  "grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_10rem_minmax(0,14rem)]";

function HeaderRow({ audited = "Audited (₹)" }: { audited?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`${ROW} text-muted-foreground hidden text-xs sm:grid`}
    >
      <span>Line</span>
      <span className="text-right">In the books</span>
      <span>{audited}</span>
      <span>Difference</span>
    </div>
  );
}

/** What a line's difference means, and where to look for a money account's. */
function Treatment({
  line,
  recordsLink,
}: {
  line: PlanLine | undefined;
  recordsLink?: ReactNode;
}) {
  if (!line || line.differencePaise === null) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  if (line.differencePaise === 0) {
    return <StatusBadge tone="success">Agrees</StatusBadge>;
  }
  const amount = (
    <span className="font-mono tabular-nums">
      {signed(line.differencePaise)}
    </span>
  );
  if (line.treatment === "find_records") {
    return (
      <span className="grid gap-1 text-sm">
        <span>
          {amount}{" "}
          <StatusBadge tone="warning">Find the missing records</StatusBadge>
        </span>
        {recordsLink}
      </span>
    );
  }
  return (
    <span className="grid gap-1 text-sm">
      <span>
        {amount}{" "}
        <StatusBadge tone="neutral">
          {line.treatment === "depreciation"
            ? "Depreciation"
            : "Year-end adjustment"}
        </StatusBadge>
      </span>
    </span>
  );
}

interface ArrayApi<T> {
  pushValue: (value: T) => void;
  removeValue: (index: number) => void;
  state: { value: { key: string }[] };
}

export function AuditedFiguresForm({
  balanceHeads,
  liveLines,
  counterHeads,
  fiscalYearId,
  funds,
  postBlocker,
  yearLabel,
}: {
  /** Active asset and liability heads, for added lines. */
  balanceHeads: readonly HeadOption[];
  /** The books' lines as they stand now (Zero, live). */
  liveLines: readonly AuditedFormLine[];
  /** Active income and expense heads a difference may post against. */
  counterHeads: readonly HeadOption[];
  fiscalYearId: string;
  funds: readonly { id: string; name: string }[];
  /** Why this year can't post now (not ended, closed); the form still compares. */
  postBlocker: ReactNode | null;
  yearLabel: string;
}) {
  // The figures are typed against the books as they stood when the page
  // opened: every input is keyed to a line of this snapshot, the payload is
  // built from it, and it is what the server checks "unchanged" against.
  // If the live books move, the treasurer refreshes it (typed figures follow
  // their line's key) before posting.
  const [snapshot, setSnapshot] = useState(liveLines);
  const booksLines = snapshot;
  const changed = booksChangedSince(snapshot, liveLines);
  const navigate = useNavigate();
  const postAudited = useServerFn(postAuditedFiguresFn);
  // One id per form, so a double submit posts once.
  const [documentId] = useState(() => uuidv7());
  const counterTypes = new Map<string, CounterHeadType>(
    counterHeads.map((h) => [h.id, h.type as CounterHeadType])
  );
  const counterOptions: SelectOption[] = counterHeads.map((h) => ({
    label: `${h.name} (${h.type === "income" ? "income" : "expense"})`,
    value: h.id,
  }));
  const fundOptions: SelectOption[] = funds.map((f) => ({
    label: f.name,
    value: f.id,
  }));
  const indexOf = new Map(booksLines.map((l, i) => [l.key, i]));

  const plan = (values: Pick<FormValues, "added" | "lines" | "transfers">) => {
    const inputs = planInputs(values);
    return planAuditedFigures({
      added: inputs.added,
      audited: inputs.audited,
      books: booksLines,
      counterHeads: counterTypes,
      transfers: inputs.transfers,
    });
  };

  const submit = useEventCallback(async (value: FormValues) => {
    const result = plan(value);
    const refusal =
      (changed
        ? "The books changed since you opened this page: refresh the figures first."
        : null) ??
      result.blockers[0]?.message ??
      null;
    if (refusal || postBlocker) {
      toast.error("Couldn't post the audited figures", {
        description: refusal ?? undefined,
      });
      return;
    }
    const inputs = planInputs(value);
    const payload = buildAuditedPayload(snapshot, inputs.audited);
    if (!payload.ok) {
      toast.error("Couldn't post the audited figures", {
        description:
          "Enter the audited figure for every line (0 when the statements show none)",
      });
      return;
    }
    try {
      await postAudited({
        data: {
          added: inputs.added.map((a) => ({
            accountHeadId: a.accountHeadId,
            auditedPaise: a.auditedPaise ?? 0,
            counterHeadId: a.counterHeadId || null,
            kind: a.kind,
            memo: a.memo ?? null,
          })),
          caName: value.caName.trim(),
          fiscalYearId,
          id: documentId,
          lines: payload.lines,
          signedOn: format(value.signedOn as Date, ISO_DATE),
          transfers: inputs.transfers,
        },
      });
      // The usual next step: close the year (or close it again).
      toast.success("Audited figures matched", {
        action: {
          label: `Close FY ${yearLabel} now`,
          onClick: () => {
            navigate({
              search: { close: "1", year: yearLabel } as never,
              to: "/finance/books",
            });
          },
        },
      });
    } catch (error) {
      toast.error("Couldn't post the audited figures", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  });

  const form = useAuditedForm(
    {
      added: [],
      caConfirmed: false,
      caName: "",
      lines: booksLines.map((l) => ({
        amount: "",
        counterHeadId: undefined,
        key: l.key,
      })),
      signedOn: undefined,
      transfers: [],
    },
    submit
  );

  const refresh = () => {
    const typed = new Map(form.state.values.lines.map((l) => [l.key, l]));
    form.setFieldValue(
      "lines",
      liveLines.map(
        (l) =>
          typed.get(l.key) ?? {
            amount: "",
            counterHeadId: undefined,
            key: l.key,
          }
      )
    );
    setSnapshot(liveLines);
  };

  const lineRow = (line: AuditedFormLine, planLine: PlanLine | undefined) => {
    const index = indexOf.get(line.key) ?? 0;
    const recordsLink =
      line.kind === "account" ? (
        <span className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
          <Link
            className="underline underline-offset-4"
            search={
              {
                account: line.orgAccountId,
                tab: "cash",
                year: yearLabel,
              } as never
            }
            to="/finance/books"
          >
            Open the cash book
          </Link>
          {line.accountKind === "bank" ? (
            <Link className="underline underline-offset-4" to="/income/bank">
              Check the bank statements
            </Link>
          ) : null}
        </span>
      ) : null;
    const showHead =
      (line.kind === "asset" || line.kind === "liability") &&
      planLine?.differencePaise !== null &&
      planLine?.differencePaise !== undefined &&
      planLine.differencePaise !== 0;
    return (
      <div
        className={ROW}
        data-books-paise={line.booksPaise}
        data-key={line.key}
        data-testid="audited-line"
        key={line.key}
      >
        <span className="min-w-0 pt-2 text-sm">{line.label}</span>
        <span className="pt-2 text-right font-mono text-sm tabular-nums">
          {formatPaise(line.booksPaise)}
        </span>
        <InputField
          hideLabel
          inputMode="decimal"
          label={`${line.label}: audited (₹)`}
          name={`lines[${index}].amount`}
          placeholder="0.00"
        />
        <div className="grid gap-2 pt-2">
          <Treatment line={planLine} recordsLink={recordsLink} />
          {showHead ? (
            <ComboboxField
              hideLabel
              label={`${line.label}: posts against`}
              name={`lines[${index}].counterHeadId`}
              options={counterOptions}
              placeholder={
                planLine?.counterHead
                  ? (counterHeads.find((h) => h.id === planLine.counterHead?.id)
                      ?.name ?? "Default head")
                  : "Default head"
              }
            />
          ) : null}
        </div>
      </div>
    );
  };

  const section = (
    title: string,
    description: string,
    kinds: readonly string[],
    result: AuditedPlan
  ) => {
    const lines = booksLines.filter((l) => kinds.includes(l.kind));
    const byKey = new Map(result.lines.map((l) => [l.key, l]));
    return (
      <Group description={description} title={title}>
        <HeaderRow />
        {lines.length === 0 ? (
          <p className="text-muted-foreground text-sm">None in the books.</p>
        ) : (
          lines.map((l) => lineRow(l, byKey.get(l.key)))
        )}
      </Group>
    );
  };

  return (
    <FormLayout className="grid max-w-4xl gap-8" form={form}>
      {changed ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm"
          data-testid="audited-books-changed"
          role="status"
        >
          <span>
            The books changed since you opened this page. Refresh to compare
            your figures with the books as they are now.
          </span>
          <Button onClick={refresh} size="sm" type="button" variant="outline">
            Refresh
          </Button>
        </div>
      ) : null}
      <form.Subscribe selector={(state) => state.values}>
        {(values) => {
          const result = plan(values);
          return (
            <>
              {section(
                "Money in the accounts",
                "Bank, fixed deposit and clearing balances at 31 March. These are never adjusted: a difference means a record is missing or wrong in the dashboard (an unrecorded bank charge, a missing transfer).",
                ["account"],
                result
              )}
              {section(
                "Assets",
                "A fixed asset the CA carries at less is depreciation; any other difference is a year-end adjustment, unless you pick another head.",
                ["asset"],
                result
              )}
              {section(
                "Liabilities",
                "Writing back a provision (such as audit fees payable) reduces the liability and lowers year-end expenditure.",
                ["liability"],
                result
              )}
              <AddedLines
                balanceHeads={balanceHeads}
                counterOptions={counterOptions}
                form={form}
                result={result}
              />
              <FundsSection
                booksLines={booksLines}
                form={form}
                fundOptions={fundOptions}
                indexOf={indexOf}
                result={result}
              />
              <Summary result={result} />
            </>
          );
        }}
      </form.Subscribe>
      <Group title="CA's signature">
        <InputField isRequired label="Chartered accountant" name="caName" />
        <DateField
          isRequired
          label="Statements signed on"
          maxDate={new Date()}
          name="signedOn"
        />
        <CheckboxField
          isRequired
          label="These are the figures of the signed balance sheet"
          name="caConfirmed"
        />
      </Group>
      {postBlocker ? (
        <p
          className="text-muted-foreground text-sm"
          data-testid="audited-post-blocker"
        >
          {postBlocker}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => state.values}>
        {(values) => (
          <FormActions
            disabled={changed || postBlocker !== null || !plan(values).canPost}
            onCancel={() =>
              navigate({
                search: { year: yearLabel } as never,
                to: "/finance/books",
              })
            }
            submitLabel="Post audited figures"
            submittingLabel="Posting..."
          />
        )}
      </form.Subscribe>
    </FormLayout>
  );
}

function useAuditedForm(
  defaultValues: FormValues,
  submit: (value: FormValues) => Promise<void>
) {
  return useForm({
    defaultValues,
    onSubmit: ({ value }) => submit(value),
    validators: { onChange: schema, onSubmit: schema },
  });
}

type AuditedForm = ReturnType<typeof useAuditedForm>;

function AddedLines({
  balanceHeads,
  counterOptions,
  form,
  result,
}: {
  balanceHeads: readonly HeadOption[];
  counterOptions: SelectOption[];
  form: AuditedForm;
  result: AuditedPlan;
}) {
  const headOptions = (kind: string): SelectOption[] =>
    balanceHeads
      .filter((h) => h.type === kind)
      .map((h) => ({ label: h.name, value: h.id }));
  const added = result.lines.filter((l) => l.added);
  return (
    <Group
      description="An audited asset or liability the books don't have yet, such as this year's audit fee provision. It posts against the year-end adjustments head unless you pick another."
      title="Added lines"
    >
      <form.Field mode="array" name="added">
        {(raw: unknown) => {
          const field = raw as unknown as ArrayApi<FormValues["added"][number]>;
          return (
            <div className="grid gap-3">
              {field.state.value.map((line, index) => {
                const planLine = added[index];
                return (
                  <div
                    className="grid gap-2 rounded-lg border p-3"
                    data-testid="audited-added-line"
                    key={line.key}
                  >
                    <div className="grid items-start gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)_32px]">
                      <SelectField
                        label="Kind"
                        name={`added[${index}].kind`}
                        options={[
                          { label: "Asset", value: "asset" },
                          { label: "Liability", value: "liability" },
                        ]}
                      />
                      <form.Subscribe
                        selector={(state) =>
                          state.values.added[index]?.kind ?? "liability"
                        }
                      >
                        {(kind) => (
                          <ComboboxField
                            label="Head"
                            name={`added[${index}].accountHeadId`}
                            options={headOptions(kind)}
                          />
                        )}
                      </form.Subscribe>
                      <InputField
                        label="Name"
                        name={`added[${index}].memo`}
                        placeholder="Such as Audit fees payable FY 2026-27"
                      />
                      <Button
                        aria-label={`Remove added line ${index + 1}`}
                        className="sm:mt-6"
                        onClick={() => field.removeValue(index)}
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
                    </div>
                    <div className="grid items-start gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
                      <InputField
                        inputMode="decimal"
                        label="Audited (₹)"
                        name={`added[${index}].amount`}
                        placeholder="0.00"
                      />
                      <ComboboxField
                        label="Posts against"
                        name={`added[${index}].counterHeadId`}
                        options={counterOptions}
                        placeholder="Year-end adjustments (audited)"
                      />
                    </div>
                    {planLine?.differencePaise ? (
                      <p className="text-muted-foreground text-sm">
                        Posts{" "}
                        <span className="font-mono tabular-nums">
                          {signed(planLine.differencePaise)}
                        </span>{" "}
                        as a year-end adjustment.
                      </p>
                    ) : null}
                  </div>
                );
              })}
              <Button
                className="self-start justify-self-start"
                onClick={() =>
                  field.pushValue({
                    accountHeadId: undefined,
                    amount: "",
                    counterHeadId: undefined,
                    key: uuidv7(),
                    kind: "liability",
                    memo: "",
                  })
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <HugeiconsIcon
                  className="size-3.5"
                  icon={PlusSignIcon}
                  strokeWidth={2}
                />
                Add a line
              </Button>
            </div>
          );
        }}
      </form.Field>
    </Group>
  );
}

function FundsSection({
  booksLines,
  form,
  fundOptions,
  indexOf,
  result,
}: {
  booksLines: readonly AuditedFormLine[];
  form: AuditedForm;
  fundOptions: SelectOption[];
  indexOf: Map<string, number>;
  result: AuditedPlan;
}) {
  const fundLines = booksLines.filter((l) => l.kind === "fund");
  return (
    <Group
      description="Funds aren't adjusted directly: the differences above flow into the General Fund through the year's surplus, then each fund is checked against the signed figure. If the CA moved money between funds, add that transfer with the reason."
      title="Funds"
    >
      <div
        aria-hidden="true"
        className={`${ROW} text-muted-foreground hidden text-xs sm:grid`}
      >
        <span>Fund</span>
        <span className="text-right">After the adjustments</span>
        <span>Audited (₹)</span>
        <span>Difference</span>
      </div>
      {fundLines.map((line) => {
        const index = indexOf.get(line.key) ?? 0;
        const check = result.funds.find((f) => f.fundId === line.fundId);
        return (
          <div
            className={ROW}
            data-books-paise={line.booksPaise}
            data-key={line.key}
            data-testid="audited-fund"
            key={line.key}
          >
            <span className="min-w-0 pt-2 text-sm">
              {line.label}
              {check && check.afterPaise !== line.booksPaise ? (
                <span className="text-muted-foreground block text-xs">
                  In the books {formatPaise(line.booksPaise)}
                </span>
              ) : null}
            </span>
            <span
              className="pt-2 text-right font-mono text-sm tabular-nums"
              data-testid="audited-fund-after"
            >
              {formatPaise(check?.afterPaise ?? line.booksPaise)}
            </span>
            <InputField
              hideLabel
              inputMode="decimal"
              label={`${line.label}: audited (₹)`}
              name={`lines[${index}].amount`}
              placeholder="0.00"
            />
            <span className="pt-2 text-sm">
              {check?.differencePaise === null || check === undefined ? (
                <span className="text-muted-foreground">—</span>
              ) : check.differencePaise === 0 ? (
                <StatusBadge tone="success">Agrees</StatusBadge>
              ) : (
                <span>
                  <span className="font-mono tabular-nums">
                    {signed(check.differencePaise)}
                  </span>{" "}
                  <StatusBadge tone="warning">Still differs</StatusBadge>
                </span>
              )}
            </span>
          </div>
        );
      })}
      <form.Field mode="array" name="transfers">
        {(raw: unknown) => {
          const field = raw as unknown as ArrayApi<
            FormValues["transfers"][number]
          >;
          return (
            <div className="grid gap-3">
              {field.state.value.map((line, index) => (
                <div
                  className="grid gap-2 rounded-lg border p-3"
                  data-testid="audited-transfer"
                  key={line.key}
                >
                  <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_32px]">
                    <SelectField
                      label="From fund"
                      name={`transfers[${index}].fromFundId`}
                      options={fundOptions}
                    />
                    <SelectField
                      label="To fund"
                      name={`transfers[${index}].toFundId`}
                      options={fundOptions}
                    />
                    <InputField
                      inputMode="decimal"
                      label="Amount (₹)"
                      name={`transfers[${index}].amount`}
                      placeholder="0.00"
                    />
                    <Button
                      aria-label={`Remove transfer ${index + 1}`}
                      className="sm:mt-6"
                      onClick={() => field.removeValue(index)}
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
                  </div>
                  <InputField
                    isRequired
                    label="Reason"
                    name={`transfers[${index}].reason`}
                    placeholder="Why the CA moved it, as the statements' fund note says"
                  />
                </div>
              ))}
              <Button
                className="self-start justify-self-start"
                onClick={() =>
                  field.pushValue({
                    amount: "",
                    fromFundId: undefined,
                    key: uuidv7(),
                    reason: "",
                    toFundId: undefined,
                  })
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <HugeiconsIcon
                  className="size-3.5"
                  icon={PlusSignIcon}
                  strokeWidth={2}
                />
                Add a transfer between funds
              </Button>
            </div>
          );
        }}
      </form.Field>
    </Group>
  );
}

function Summary({ result }: { result: AuditedPlan }) {
  return (
    <section
      aria-label="Summary"
      className="grid gap-2 rounded-lg border px-3 py-2.5 text-sm"
      data-testid="audited-summary"
    >
      <div className="flex flex-wrap items-center gap-2">
        {result.audited ? (
          <>
            <span>
              Audited assets{" "}
              <span className="font-mono tabular-nums">
                {formatPaise(result.audited.assetsPaise)}
              </span>
            </span>
            <span aria-hidden="true">=</span>
            <span>
              Funds + liabilities{" "}
              <span className="font-mono tabular-nums">
                {formatPaise(
                  result.audited.fundsPaise + result.audited.liabilitiesPaise
                )}
              </span>
            </span>
            {result.audited.balanced ? (
              <StatusBadge tone="success">Balances</StatusBadge>
            ) : (
              <StatusBadge tone="warning">Doesn't balance</StatusBadge>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">
            Enter every audited figure to check that they balance.
          </span>
        )}
      </div>
      <div>
        Year-end adjustments to the surplus:{" "}
        <span className="font-mono tabular-nums" data-testid="audited-surplus">
          {signed(result.surplusPaise)}
        </span>
        {result.entries.length === 0
          ? " (nothing to post: the books agree)"
          : ` in ${result.entries.length} entries dated 31 March`}
      </div>
      {result.blockers.length > 0 ? (
        <ul
          className="text-warning-foreground grid gap-1"
          data-testid="audited-blockers"
        >
          {result.blockers.map((b) => (
            <li key={b.code}>{b.message}</li>
          ))}
        </ul>
      ) : (
        <StatusBadge data-testid="audited-ready" tone="success">
          Ready to post
        </StatusBadge>
      )}
    </section>
  );
}
