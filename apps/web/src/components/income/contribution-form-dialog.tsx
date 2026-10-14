import { UserAdd01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BrailleSpinner } from "@pi-dash/design-system/components/braille-spinner";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type ContributionChannel,
  contributionChannelValues,
  type ContributionReportingMode,
  contributionReportingModeValues,
  type DonationType,
  donationTypeValues,
  GENERAL_FUND_ID,
  PROGRAMME_IDS,
} from "@pi-dash/shared/constants";
import {
  CONTRIBUTION_CHANNEL_LABELS,
  contributionRuleIssues,
  DONATION_TYPE_LABELS,
  defaultReportingMode,
  razorpayPaymentUrl,
  REPORTING_MODE_LABELS,
} from "@pi-dash/shared/income";
import { rupeesToPaise } from "@pi-dash/shared/money";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { DonorFormDialog } from "@/components/donors/donor-form-dialog";
import { contributorOptions } from "@/components/donors/party-row";
import { ComboboxField } from "@/components/form/combobox-field";
import { DateField } from "@/components/form/date-field";
import { FormLayout } from "@/components/form/form-layout";
import { FormSectionHeading } from "@/components/form/form-section";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import { TextareaField } from "@/components/form/textarea-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { useApp } from "@/context/app-context";
import { positiveRupeesSchema } from "@/lib/form-schemas";
import { epochToLocalDate, localDateToIso } from "@/lib/local-date";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";
import { paiseToRupeesInput } from "@/lib/paise";

import type { ContributionRow } from "./income-types";
import { withCurrentOption } from "./picker-options";
import { useSettlementLock } from "./settlements/contribution-settlement";

const enumOptions = <T extends string>(
  values: readonly T[],
  labels: Record<T, string>
) => values.map((value) => ({ label: labels[value], value }));

const channelOptions = enumOptions(
  contributionChannelValues,
  CONTRIBUTION_CHANNEL_LABELS
);
const reportingModeOptions = enumOptions(
  contributionReportingModeValues,
  REPORTING_MODE_LABELS
);
const donationTypeOptions = enumOptions(
  donationTypeValues,
  DONATION_TYPE_LABELS
);

const text = (max: number) => z.string().trim().max(max);
/** A required picker: empty until chosen, so the input type allows undefined. */
const pick = (message: string) =>
  z
    .string()
    .optional()
    .refine((value) => Boolean(value), message);
const requiredDate = (message: string) =>
  z
    .date()
    .optional()
    .refine((value) => value !== undefined, message);

const formSchema = z
  .object({
    amount: positiveRupeesSchema,
    channel: z.enum(contributionChannelValues),
    donationType: z.enum(donationTypeValues),
    donationTypeDescription: text(200),
    fundId: pick("Pick a fund"),
    inKindDescription: text(500),
    inKindValuationBasis: text(500),
    notes: text(1000),
    orgAccountId: z.string().optional(),
    partyId: pick("Pick a donor"),
    programmeId: z.string().optional(),
    projectId: z.string().optional(),
    receivedOn: requiredDate("Pick the date it was received"),
    reference: text(120),
    reportingMode: z.enum(contributionReportingModeValues),
    reportingModeDescription: text(200),
  })
  .superRefine((value, context) => {
    const issues = contributionRuleIssues({
      ...value,
      // A hidden account field never blocks an in-kind gift.
      orgAccountId: value.channel === "in_kind" ? null : value.orgAccountId,
    });
    for (const issue of issues) {
      context.addIssue({
        code: "custom",
        message: issue.message,
        path: [issue.path],
      });
    }
  });

type FormValues = z.input<typeof formSchema>;

/** Kept by "Save and record another" so a batch of gifts is quick to enter. */
export interface CarriedValues {
  channel: ContributionChannel;
  orgAccountId?: string;
  receivedOn?: Date;
}

function emptyValues(
  fundId: string | undefined,
  carried: CarriedValues | null
) {
  const channel = carried?.channel ?? "upi";
  return {
    amount: "",
    channel,
    donationType: "voluntary" as DonationType,
    donationTypeDescription: "",
    fundId,
    inKindDescription: "",
    inKindValuationBasis: "",
    notes: "",
    orgAccountId: carried?.orgAccountId,
    partyId: undefined as string | undefined,
    programmeId: undefined as string | undefined,
    projectId: undefined as string | undefined,
    receivedOn: carried?.receivedOn ?? new Date(),
    reference: "",
    reportingMode: defaultReportingMode(channel) as ContributionReportingMode,
    reportingModeDescription: "",
  } satisfies FormValues;
}

function valuesFor(row: ContributionRow): FormValues {
  return {
    amount: paiseToRupeesInput(row.amountPaise),
    channel: row.channel as ContributionChannel,
    donationType: (row.donationType ?? "voluntary") as DonationType,
    donationTypeDescription: row.donationTypeDescription ?? "",
    fundId: row.fundId,
    inKindDescription: row.inKindDescription ?? "",
    inKindValuationBasis: row.inKindValuationBasis ?? "",
    notes: row.notes ?? "",
    orgAccountId: row.orgAccountId ?? undefined,
    partyId: row.partyId,
    programmeId: row.programmeId ?? undefined,
    projectId: row.projectId ?? undefined,
    receivedOn: epochToLocalDate(row.receivedOn),
    reference: row.reference ?? "",
    reportingMode: row.reportingMode as ContributionReportingMode,
    reportingModeDescription: row.reportingModeDescription ?? "",
  };
}

function toMutatorArgs(id: string, value: FormValues) {
  return {
    amountPaise: rupeesToPaise(value.amount),
    channel: value.channel,
    donationType: value.donationType,
    donationTypeDescription: value.donationTypeDescription || null,
    fundId: value.fundId ?? "",
    id,
    inKindDescription: value.inKindDescription || null,
    inKindValuationBasis: value.inKindValuationBasis || null,
    notes: value.notes || null,
    orgAccountId:
      value.channel === "in_kind" ? null : (value.orgAccountId ?? null),
    partyId: value.partyId ?? "",
    programmeId: value.programmeId ?? null,
    projectId: value.projectId ?? null,
    receivedOn: localDateToIso(value.receivedOn) ?? "",
    reference: value.reference || null,
    reportingMode: value.reportingMode,
    reportingModeDescription: value.reportingModeDescription || null,
  };
}

/** Active records to pick from, plus whatever the edited row already uses. */
function usePickerOptions(row: ContributionRow | null) {
  const { hasPermission } = useApp();
  const [parties] = useQuery(queries.party.all());
  const [accounts] = useQuery(queries.orgAccount.active());
  const [funds] = useQuery(queries.fund.active());
  const [programmes] = useQuery(queries.programme.active());
  // Project rows carry sponsor and budget terms, so only finance.view syncs them.
  const [projects] = useQuery(queries.project.all(), {
    enabled: hasPermission("finance.view"),
  });
  const programmeNames = new Map(programmes.map((p) => [p.id, p.name]));
  const projectLabel = (name: string, programmeName: string | undefined) =>
    `${name} (${programmeName ?? "No programme"})`;
  return {
    accountOptions: withCurrentOption(
      accounts.map((a) => ({ label: a.name, value: a.id })),
      row?.orgAccountId,
      row?.orgAccount?.name
    ),
    donorOptions: withCurrentOption(
      contributorOptions(parties),
      row?.partyId,
      row?.party?.displayName
    ),
    fundOptions: withCurrentOption(
      funds.map((f) => ({ label: f.name, value: f.id })),
      row?.fundId,
      row?.fund?.name
    ),
    funds,
    programmeOptions: withCurrentOption(
      programmes
        .filter((p) => p.id !== PROGRAMME_IDS.unallocated)
        .map((p) => ({ label: p.name, value: p.id })),
      row?.programmeId,
      row?.programme?.name
    ),
    projectOptions: withCurrentOption(
      projects
        .filter((p) => p.status !== "closed")
        .map((p) => ({
          label: projectLabel(p.name, programmeNames.get(p.programmeId)),
          value: p.id,
        })),
      // Without finance.view the project never syncs, so the field stays hidden.
      row?.project ? row.projectId : null,
      row?.project ? projectLabel(row.project.name, row.programme?.name) : null
    ),
    projects,
  };
}

function ContributionForm({
  carried,
  contribution,
  onOpenChange,
  onRecordAnother,
}: {
  carried: CarriedValues | null;
  contribution: ContributionRow | null;
  onOpenChange: (open: boolean) => void;
  onRecordAnother: (carried: CarriedValues) => void;
}) {
  const zero = useZero();
  const isEdit = contribution !== null;
  // A refund recorded against it, or a processed Razorpay settlement that
  // paid it out, fixes what the provider reported; until the settlement is
  // known the fields stay fixed.
  const settlementLock = useSettlementLock(
    contribution?.id ?? null,
    contribution !== null && razorpayPaymentUrl(contribution) !== null
  );
  const hasRefund = (contribution?.refunds?.length ?? 0) > 0;
  const refundLocked = hasRefund || settlementLock !== "unlocked";
  const lockedNote = hasRefund
    ? "Fixed: a refund is recorded against this contribution."
    : refundLocked
      ? settlementLock === "locked"
        ? "Fixed: Razorpay has settled this contribution to the bank."
        : "Fixed until pi-dash has checked whether Razorpay settled it."
      : undefined;
  // Fixed for the life of the form so a retried save cannot duplicate.
  const [id] = useState(() => contribution?.id ?? uuidv7());
  const [donorDialogOpen, setDonorDialogOpen] = useState(false);
  const picker = usePickerOptions(contribution);
  const defaultFundId =
    picker.funds.find((f) => f.id === GENERAL_FUND_ID)?.id ??
    picker.funds[0]?.id;

  const form = useForm({
    defaultValues: contribution
      ? valuesFor(contribution)
      : emptyValues(defaultFundId, carried),
    listeners: {
      onChange: ({ fieldApi, formApi }) => {
        if (fieldApi.name === "channel") {
          const channel = formApi.getFieldValue("channel");
          formApi.setFieldValue("reportingMode", defaultReportingMode(channel));
        }
        if (fieldApi.name === "projectId") {
          const projectId = formApi.getFieldValue("projectId");
          const project = picker.projects.find((p) => p.id === projectId);
          if (project) {
            formApi.setFieldValue("programmeId", project.programmeId);
          }
        }
      },
    },
    onSubmit: async ({ meta, value }) => {
      const args = toMutatorArgs(id, value);
      const mutation = isEdit
        ? mutators.contribution.update(args)
        : mutators.contribution.create(args);
      const res = await zero.mutate(mutation).server;
      handleMutationResult(res, {
        entityId: id,
        errorMsg: "Couldn't save contribution",
        mutation: isEdit ? "contribution.update" : "contribution.create",
        showErrorToast: false,
        successMsg: isEdit ? "Contribution updated" : "Contribution recorded",
      });
      if (res.type === "error") {
        toast.error("Couldn't save contribution", {
          description: getMutationResultErrorMessage(
            res.error,
            "Something went wrong"
          ),
        });
        return;
      }
      if (meta.another) {
        onRecordAnother({
          channel: value.channel,
          orgAccountId: value.orgAccountId,
          receivedOn: value.receivedOn,
        });
        return;
      }
      onOpenChange(false);
    },
    onSubmitMeta: { another: false },
    validators: { onChange: formSchema, onSubmit: formSchema },
  });

  const cancel = useEventCallback(() => onOpenChange(false));
  const saveAndAnother = useEventCallback(() => {
    form.handleSubmit({ another: true });
  });
  const openDonorDialog = useEventCallback(() => setDonorDialogOpen(true));
  const handleDonorCreated = useEventCallback((partyId: string) => {
    form.setFieldValue("partyId", partyId);
  });

  return (
    <>
      <FormLayout form={form}>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <ComboboxField
              description={lockedNote}
              disabled={refundLocked}
              emptyMessage="No donors match. Add a new donor instead."
              isRequired
              label="Donor"
              name="partyId"
              options={picker.donorOptions}
              placeholder="Search donors..."
            />
          </div>
          <Button
            disabled={refundLocked}
            onClick={openDonorDialog}
            type="button"
            variant="outline"
          >
            <HugeiconsIcon
              className="size-4"
              icon={UserAdd01Icon}
              strokeWidth={2}
            />
            New donor
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField
            disabled={refundLocked}
            isRequired
            label="Amount (₹)"
            name="amount"
          />
          <DateField
            disabled={refundLocked}
            isRequired
            label="Received on"
            maxDate={new Date()}
            name="receivedOn"
          />
          <SelectField
            disabled={refundLocked}
            isRequired
            label="Channel"
            name="channel"
            options={channelOptions}
          />
          <SelectField
            description="Filled in from the channel; change it if the donation statement needs another mode."
            isRequired
            label="Reporting mode"
            name="reportingMode"
            options={reportingModeOptions}
          />
        </div>
        <form.Subscribe
          selector={(state) => ({
            channel: state.values.channel,
            donationType: state.values.donationType,
            projectId: state.values.projectId,
            reportingMode: state.values.reportingMode,
          })}
        >
          {({ channel, donationType, projectId, reportingMode }) => (
            <div className="grid gap-4 sm:grid-cols-2">
              {reportingMode === "other" ? (
                <InputField
                  isRequired
                  label="Reporting mode description"
                  name="reportingModeDescription"
                />
              ) : null}
              {channel === "in_kind" ? (
                <>
                  <InputField
                    isRequired
                    label="What was given"
                    name="inKindDescription"
                  />
                  <InputField
                    description="For example the invoice value or a market quote."
                    isRequired
                    label="Valuation basis"
                    name="inKindValuationBasis"
                  />
                </>
              ) : (
                <ComboboxField
                  disabled={refundLocked}
                  emptyMessage="No active accounts."
                  isRequired
                  label="Deposited into"
                  name="orgAccountId"
                  options={picker.accountOptions}
                  placeholder="Search accounts..."
                />
              )}
              <SelectField
                isRequired
                label="Donation type"
                name="donationType"
                options={donationTypeOptions}
              />
              {donationType === "other" ? (
                <InputField
                  isRequired
                  label="Donation type description"
                  name="donationTypeDescription"
                />
              ) : null}
              {picker.fundOptions.length > 1 ? (
                <SelectField
                  isRequired
                  label="Fund"
                  name="fundId"
                  options={picker.fundOptions}
                />
              ) : null}
              <ComboboxField
                description={projectId ? "Set by the project." : undefined}
                disabled={Boolean(projectId)}
                label="Programme"
                name="programmeId"
                options={picker.programmeOptions}
                placeholder="Search programmes..."
              />
              {picker.projectOptions.length > 0 ? (
                <ComboboxField
                  label="Project"
                  name="projectId"
                  options={picker.projectOptions}
                  placeholder="Search projects..."
                />
              ) : null}
            </div>
          )}
        </form.Subscribe>
        <FormSectionHeading>Reference</FormSectionHeading>
        <div className="grid gap-4">
          <InputField
            description="UTR, cheque number or gateway payment ID."
            label="Reference"
            name="reference"
          />
          <TextareaField label="Notes" name="notes" rows={2} />
        </div>
        <form.Subscribe
          selector={(state) => ({ isSubmitting: state.isSubmitting })}
        >
          {({ isSubmitting }) => (
            <div
              className="flex flex-wrap justify-end gap-2"
              data-slot="form-actions"
            >
              <Button
                data-form-dismiss
                onClick={cancel}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              {isEdit ? null : (
                <Button
                  disabled={isSubmitting}
                  onClick={saveAndAnother}
                  type="button"
                  variant="outline"
                >
                  Save and record another
                </Button>
              )}
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? (
                  <>
                    <BrailleSpinner variant="inline" />
                    Saving...
                  </>
                ) : (
                  <>{isEdit ? "Save changes" : "Save contribution"}</>
                )}
              </Button>
            </div>
          )}
        </form.Subscribe>
      </FormLayout>
      <DonorFormDialog
        onOpenChange={setDonorDialogOpen}
        onSaved={handleDonorCreated}
        open={donorDialogOpen}
        party={null}
      />
    </>
  );
}

export function ContributionFormDialog({
  contribution,
  onOpenChange,
  open,
}: {
  contribution: ContributionRow | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [formKey, setFormKey] = useState(0);
  const [carried, setCarried] = useState<CarriedValues | null>(null);
  // The form mounts only while open, so each opening starts fresh; values
  // carried by "Save and record another" end with the dialog.
  const handleOpenChange = useEventCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setCarried(null);
    }
    onOpenChange(nextOpen);
  });
  const handleRecordAnother = useEventCallback((next: CarriedValues) => {
    setCarried(next);
    setFormKey((k) => k + 1);
  });
  const isEdit = contribution !== null;

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-lg)">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit contribution" : "Record contribution"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit
              ? "Change the details of this contribution"
              : "Record a donation received from a donor"}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ContributionForm
            carried={carried}
            contribution={contribution}
            key={`${contribution?.id ?? "new"}-${formKey}`}
            onOpenChange={handleOpenChange}
            onRecordAnother={handleRecordAnother}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
