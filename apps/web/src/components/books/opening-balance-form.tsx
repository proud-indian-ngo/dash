import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type OpeningLineKind,
  openingBalanceCheck,
} from "@pi-dash/shared/ledger";
import {
  formatPaise,
  RUPEES_INPUT_MESSAGE,
  tryRupeesToPaise,
} from "@pi-dash/shared/money";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { CheckboxField } from "@/components/form/checkbox-field";
import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { postOpeningBalancesFn } from "@/functions/books";
import { ISO_DATE } from "@/lib/date-formats";

/**
 * The opening-balance document (finance-ledger-cutover.md section 2): the
 * amounts from the audited balance sheet, typed in by the treasurer, never
 * pre-filled. Money in the trust's accounts, then fixed assets one line per
 * asset, liabilities, and fund balances. It posts only when assets equal
 * funds plus liabilities and the CA's confirmation is recorded.
 */

const amountSchema = z
  .string()
  .trim()
  .refine((value) => {
    if (!value) {
      return true;
    }
    const paise = tryRupeesToPaise(value);
    return paise !== null && paise >= 0;
  }, RUPEES_INPUT_MESSAGE);

const namedLine = z
  .object({
    amount: amountSchema,
    key: z.string(),
    memo: z.string().trim().max(120),
  })
  .refine((line) => !(line.amount && !line.memo), {
    message: "Name the line",
    path: ["memo"],
  });

const schema = z
  .object({
    accounts: z.array(
      z.object({
        amount: amountSchema,
        name: z.string(),
        orgAccountId: z.string(),
      })
    ),
    assets: z.array(namedLine),
    caConfirmed: z
      .boolean()
      .refine(Boolean, "Confirm the CA has signed off these figures"),
    caConfirmedOn: z
      .date()
      .optional()
      .refine((value) => value !== undefined, "Pick the date the CA confirmed"),
    caName: z
      .string()
      .trim()
      .min(1, "Enter the chartered accountant's name")
      .max(120),
    funds: z.array(
      z.object({ amount: amountSchema, fundId: z.string(), name: z.string() })
    ),
    liabilities: z.array(namedLine),
  })
  .superRefine((value, context) => {
    const check = openingBalanceCheck(toLines(value));
    if (!check.balanced) {
      context.addIssue({
        code: "custom",
        message: "Assets must equal funds plus liabilities",
        path: ["caConfirmed"],
      });
    }
  });

type FormValues = z.input<typeof schema>;

interface Line {
  amountPaise: number;
  fundId?: string;
  kind: OpeningLineKind;
  memo?: string;
  orgAccountId?: string;
}

const paiseOf = (amount: string) => tryRupeesToPaise(amount.trim() || "0") ?? 0;

/** The non-zero lines the form describes. */
function toLines(
  value: Pick<FormValues, "accounts" | "assets" | "funds" | "liabilities">
): Line[] {
  const lines: Line[] = [
    ...value.accounts.map((a) => ({
      amountPaise: paiseOf(a.amount),
      kind: "account" as const,
      orgAccountId: a.orgAccountId,
    })),
    ...value.assets.map((a) => ({
      amountPaise: paiseOf(a.amount),
      kind: "asset" as const,
      memo: a.memo.trim(),
    })),
    ...value.liabilities.map((l) => ({
      amountPaise: paiseOf(l.amount),
      kind: "liability" as const,
      memo: l.memo.trim(),
    })),
    ...value.funds.map((f) => ({
      amountPaise: paiseOf(f.amount),
      fundId: f.fundId,
      kind: "fund" as const,
    })),
  ];
  return lines.filter((line) => line.amountPaise > 0);
}

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

interface ArrayFieldApi {
  pushValue: (value: { amount: string; key: string; memo: string }) => void;
  removeValue: (index: number) => void;
  state: { value: { key: string }[] };
}

function NamedLines({
  addLabel,
  form,
  label,
  name,
  placeholder,
}: {
  addLabel: string;
  form: ReturnType<typeof useOpeningForm>;
  label: string;
  name: "assets" | "liabilities";
  placeholder: string;
}) {
  return (
    <form.Field mode="array" name={name}>
      {(raw: unknown) => {
        const field = raw as ArrayFieldApi;
        return (
          <div className="flex flex-col gap-2">
            {field.state.value.map((line, index) => (
              <div
                className="grid items-start gap-2 sm:grid-cols-[1fr_12rem_32px]"
                key={line.key}
              >
                <InputField
                  hideLabel
                  label={`${label} ${index + 1}`}
                  name={`${name}[${index}].memo`}
                  placeholder={placeholder}
                />
                <InputField
                  hideLabel
                  inputMode="decimal"
                  label={`${label} ${index + 1} amount (₹)`}
                  name={`${name}[${index}].amount`}
                  placeholder="0.00"
                />
                <Button
                  aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
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
            ))}
            <Button
              className="self-start"
              onClick={() =>
                field.pushValue({ amount: "", key: uuidv7(), memo: "" })
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
              {addLabel}
            </Button>
          </div>
        );
      }}
    </form.Field>
  );
}

function BalanceCheck({ form }: { form: ReturnType<typeof useOpeningForm> }) {
  return (
    <form.Subscribe selector={(state) => state.values}>
      {(values) => {
        const check = openingBalanceCheck(toLines(values));
        return (
          <div
            className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 text-sm"
            data-testid="opening-check"
          >
            <span>
              Assets{" "}
              <span className="font-mono tabular-nums">
                {formatPaise(check.assetsPaise)}
              </span>
            </span>
            <span aria-hidden="true">=</span>
            <span>
              Funds + liabilities{" "}
              <span className="font-mono tabular-nums">
                {formatPaise(check.fundsPaise + check.liabilitiesPaise)}
              </span>
            </span>
            {check.balanced ? (
              <StatusBadge tone="success">Balances</StatusBadge>
            ) : (
              <StatusBadge tone="warning">
                Off by {formatPaise(Math.abs(check.differencePaise))}
              </StatusBadge>
            )}
          </div>
        );
      }}
    </form.Subscribe>
  );
}

function useOpeningForm(
  defaultValues: FormValues,
  submit: (value: FormValues) => Promise<void>
) {
  return useForm({
    defaultValues,
    onSubmit: ({ value }) => submit(value),
    validators: { onChange: schema, onSubmit: schema },
  });
}

export function OpeningBalanceForm({
  accounts,
  fiscalYearId,
  funds,
  label,
}: {
  accounts: readonly { id: string; name: string }[];
  fiscalYearId: string;
  funds: readonly { id: string; name: string }[];
  label: string;
}) {
  const navigate = useNavigate();
  const postOpening = useServerFn(postOpeningBalancesFn);
  // One id per form, so a double submit posts once.
  const [documentId] = useState(() => uuidv7());
  const submit = useEventCallback(async (value: FormValues) => {
    try {
      await postOpening({
        data: {
          caConfirmedOn: format(value.caConfirmedOn as Date, ISO_DATE),
          caName: value.caName.trim(),
          fiscalYearId,
          id: documentId,
          lines: toLines(value).map((line) => ({
            amountPaise: line.amountPaise,
            fundId: line.fundId ?? null,
            kind: line.kind,
            memo: line.memo || null,
            orgAccountId: line.orgAccountId ?? null,
          })),
        },
      });
      toast.success("Opening balances posted");
      await navigate({ search: { tab: "balance" }, to: "/finance/books" });
    } catch (error) {
      toast.error("Couldn't post the opening balances", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  });
  const form = useOpeningForm(
    {
      accounts: accounts.map((a) => ({
        amount: "",
        name: a.name,
        orgAccountId: a.id,
      })),
      assets: [{ amount: "", key: uuidv7(), memo: "" }],
      caConfirmed: false,
      caConfirmedOn: undefined,
      caName: "",
      funds: funds.map((f) => ({ amount: "", fundId: f.id, name: f.name })),
      liabilities: [{ amount: "", key: uuidv7(), memo: "" }],
    },
    submit
  );

  return (
    <FormLayout className="grid max-w-2xl gap-6" form={form}>
      <Group
        description={`Closing balances at 31 March from the audited statements, entered as at the start of FY ${label}. Leave a line blank if it is nil.`}
        title="Money in the accounts"
      >
        {accounts.map((account, index) => (
          <InputField
            inputMode="decimal"
            key={account.id}
            label={`${account.name} (₹)`}
            name={`accounts[${index}].amount`}
            placeholder="0.00"
          />
        ))}
      </Group>
      <Group
        description="Property, plant and equipment at written-down value, one line per asset."
        title="Fixed assets"
      >
        <NamedLines
          addLabel="Add asset"
          form={form}
          label="Asset"
          name="assets"
          placeholder="Asset name"
        />
      </Group>
      <Group
        description="Provisions and amounts owed, such as audit fees payable."
        title="Liabilities"
      >
        <NamedLines
          addLabel="Add liability"
          form={form}
          label="Liability"
          name="liabilities"
          placeholder="Liability name"
        />
      </Group>
      <Group
        description="Each fund's balance from the balance sheet."
        title="Funds"
      >
        {funds.map((f, index) => (
          <InputField
            inputMode="decimal"
            key={f.id}
            label={`${f.name} (₹)`}
            name={`funds[${index}].amount`}
            placeholder="0.00"
          />
        ))}
      </Group>
      <BalanceCheck form={form} />
      <Group title="CA confirmation">
        <InputField isRequired label="Chartered accountant" name="caName" />
        <DateField
          isRequired
          label="Confirmed on"
          maxDate={new Date()}
          name="caConfirmedOn"
        />
        <CheckboxField
          isRequired
          label="The CA has confirmed these figures"
          name="caConfirmed"
        />
      </Group>
      <FormActions
        onCancel={() => navigate({ to: "/finance/books" })}
        submitLabel="Post opening balances"
        submittingLabel="Posting..."
      />
    </FormLayout>
  );
}
