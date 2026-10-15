import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { GENERAL_FUND_ID } from "@pi-dash/shared/constants";
import { defaultGiveDoAccount } from "@pi-dash/shared/contribution-channel";
import { todayInKolkata } from "@pi-dash/shared/income";
import { formatPaise } from "@pi-dash/shared/money";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useState } from "react";
import z from "zod";

import { CheckboxField } from "@/components/form/checkbox-field";
import { ComboboxField } from "@/components/form/combobox-field";
import { CustomField } from "@/components/form/custom-field";
import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { ReviewTable } from "@/components/income/import/review-table";
import {
  createGiveDoPayoutImport,
  getGiveDoPayoutImport,
  runGiveDoPayoutImport,
} from "@/functions/give-do-payouts";
import type { PayoutReview, PayoutRunResult } from "@/lib/give-do-payout/types";
import type { RowDecision } from "@/lib/income-import/classify";
import { MAX_IMPORT_FILE_BYTES } from "@/lib/income-import/fields";

const uploadSchema = z.object({
  file: z
    .custom<File>((file) => file instanceof File, "Choose the payout XLSX file")
    .refine(
      (file) => !file || file.size <= MAX_IMPORT_FILE_BYTES,
      "The file is larger than 5 MB"
    ),
  fundId: z.uuid("Choose a fund"),
  orgAccountId: z.uuid("Choose a give.do clearing account"),
});

async function fileBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

function PayoutUploadForm({
  accounts,
  funds,
  onUploaded,
}: {
  accounts: readonly { id: string; kind: string; name: string }[];
  funds: readonly { id: string; name: string }[];
  onUploaded: (review: PayoutReview) => void;
}) {
  const upload = useServerFn(createGiveDoPayoutImport);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: {
      file: null as File | null,
      fundId:
        funds.find((fund) => fund.id === GENERAL_FUND_ID)?.id ??
        funds[0]?.id ??
        "",
      orgAccountId: defaultGiveDoAccount(accounts)?.id ?? "",
    },
    validators: { onChange: uploadSchema, onSubmit: uploadSchema },
    onSubmit: async ({ value }) => {
      if (!value.file) {
        return;
      }
      setError(null);
      try {
        onUploaded(
          await upload({
            data: {
              base64: await fileBase64(value.file),
              fileName: value.file.name,
              fundId: value.fundId,
              orgAccountId: value.orgAccountId,
            },
          })
        );
      } catch (caught) {
        log.error({
          action: "payout.upload",
          component: "PayoutImportWizard",
          error: "Payout upload failed",
        });
        setError(
          caught instanceof Error
            ? caught.message
            : "The payout could not be uploaded."
        );
      }
    },
  });
  return (
    <FormLayout className="max-w-xl" form={form}>
      <ComboboxField
        isRequired
        label="give.do clearing account"
        name="orgAccountId"
        options={accounts
          .filter((account) => account.kind === "gateway_clearing")
          .map((account) => ({ label: account.name, value: account.id }))}
        description={
          <>
            Choose the account used for give.do donation imports. Accounts can
            be added in{" "}
            <Link className="underline" to="/settings/org-accounts">
              Organisation accounts
            </Link>
            .
          </>
        }
      />
      <ComboboxField
        isRequired
        label="Fund for new donations"
        name="fundId"
        options={funds.map((fund) => ({ label: fund.name, value: fund.id }))}
      />
      <CustomField<File | null>
        isRequired
        label="Payout XLSX file"
        name="file"
        description="Upload the give.do workbook with Donations and Campaign Level sheets. Up to 5 MB and 5,000 donations."
      >
        {(field) => (
          <Input
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            data-testid="payout-file-input"
            id={field.name}
            onBlur={field.handleBlur}
            onChange={(event) =>
              field.handleChange(event.target.files?.[0] ?? null)
            }
            type="file"
          />
        )}
      </CustomField>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <FormActions
        submitLabel="Review payout"
        submittingLabel="Reading payout..."
      />
    </FormLayout>
  );
}

const reviewSchema = z.object({
  decisions: z.record(
    z.string(),
    z.object({
      contribution: z.enum(["import", "skip"]).optional(),
      donor: z.string().optional(),
      fillMissing: z.boolean().optional(),
    })
  ),
  importUnknown: z.boolean(),
  settledOn: z.date(),
});

function PayoutReviewForm({
  onImported,
  payout,
}: {
  onImported: (result: PayoutRunResult) => void;
  payout: PayoutReview;
}) {
  const run = useServerFn(runGiveDoPayoutImport);
  const [maxDate] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: {
      decisions: {} as Record<string, RowDecision>,
      importUnknown: false,
      settledOn: new Date(`${payout.settledOn}T12:00:00+05:30`),
    },
    validators: { onChange: reviewSchema, onSubmit: reviewSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        onImported(
          await run({
            data: {
              ...value,
              batchId: payout.review.batch.id,
              settledOn: todayInKolkata(value.settledOn),
            },
          })
        );
      } catch (caught) {
        log.error({
          action: "payout.run",
          batchId: payout.review.batch.id,
          component: "PayoutImportWizard",
          error: "Payout import failed",
        });
        setError(
          caught instanceof Error
            ? caught.message
            : "The payout could not be imported."
        );
      }
    },
  });
  return (
    <FormLayout form={form}>
      <div
        className="grid gap-2 rounded-lg border p-4 text-sm"
        data-testid="payout-totals"
      >
        <p className="font-medium">UTR {payout.utr}</p>
        <p>
          {payout.review.rows.length} donations · Gross{" "}
          {formatPaise(payout.grossPaise)} · Charges{" "}
          {formatPaise(payout.feesPaise)} · Net payout{" "}
          {formatPaise(payout.amountPaise)}
        </p>
      </div>
      {payout.existing ? (
        <p
          className={
            payout.existing.changed
              ? "text-warning-foreground text-sm"
              : "text-muted-foreground text-sm"
          }
          role="status"
        >
          {payout.existing.changed
            ? "This UTR is already imported with different payout evidence. Import will flag the mismatch and preserve the original settlement."
            : "Already imported. This UTR already has a settlement; importing again creates no duplicates."}
        </p>
      ) : (
        <>
          <div className="max-w-xl space-y-4">
            <DateField
              description="Defaults to the upload date because the file has no payout date. Use the date from give.do's email if available."
              isRequired
              label="Settled on"
              maxDate={maxDate}
              name="settledOn"
            />
            <CheckboxField
              description="Review donor matches below. If off, unknown transactions remain unlinked in the settlement and can be linked by a later donation import."
              label="Import unknown donations"
              name="importUnknown"
            />
          </div>
          <form.Subscribe
            selector={(state) => ({
              decisions: state.values.decisions,
              importUnknown: state.values.importUnknown,
            })}
          >
            {({ decisions, importUnknown }) => (
              <ReviewTable
                decisions={decisions}
                onDecide={
                  importUnknown
                    ? (rowId, decision) =>
                        form.setFieldValue("decisions", {
                          ...decisions,
                          [rowId]: decision,
                        })
                    : undefined
                }
                rows={payout.review.rows}
              />
            )}
          </form.Subscribe>
        </>
      )}
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <FormActions
        submitLabel={
          payout.existing?.changed ? "Flag payout mismatch" : "Import payout"
        }
        submittingLabel="Importing payout..."
      />
    </FormLayout>
  );
}

export function PayoutImportWizard() {
  const [batchId, setBatchId] = useQueryState("batch", parseAsString);
  const [payout, setPayout] = useState<PayoutReview | null>(null);
  const [result, setResult] = useState<PayoutRunResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useServerFn(getGiveDoPayoutImport);
  const [accounts, accountsResult] = useQuery(queries.orgAccount.active());
  const [funds, fundsResult] = useQuery(queries.fund.active());
  useEffect(() => {
    if (!batchId || payout?.review.batch.id === batchId) {
      return;
    }
    let cancelled = false;
    load({ data: { batchId } })
      .then((review) => {
        if (!cancelled) {
          setPayout(review);
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "payout.load",
          batchId,
          component: "PayoutImportWizard",
          error: "Payout review failed",
        });
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "The payout could not be loaded."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [batchId, load, payout?.review.batch.id]);
  if (result) {
    return (
      <div className="space-y-4" role="status">
        <p>
          {result.changed
            ? "Payout mismatch flagged. The original settlement was preserved."
            : result.alreadyImported
              ? "Already imported. No duplicates created."
              : `Payout imported. ${result.result?.imported ?? 0} donations imported and ${result.result?.linked ?? 0} linked.`}
        </p>
        <Button render={<Link search={{ tab: "settlements" }} to="/income" />}>
          View settlements
        </Button>
      </div>
    );
  }
  if (loadError) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {loadError}
      </p>
    );
  }
  if (payout) {
    return (
      <PayoutReviewForm
        key={payout.review.batch.id}
        onImported={setResult}
        payout={payout}
      />
    );
  }
  if (
    batchId ||
    accountsResult.type !== "complete" ||
    fundsResult.type !== "complete"
  ) {
    return (
      <p className="text-muted-foreground text-sm">Loading payout import...</p>
    );
  }
  return (
    <PayoutUploadForm
      accounts={accounts}
      funds={funds}
      onUploaded={(review) => {
        setPayout(review);
        void setBatchId(review.review.batch.id);
      }}
    />
  );
}
