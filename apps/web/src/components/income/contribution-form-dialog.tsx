import { UserAdd01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BrailleSpinner } from "@pi-dash/design-system/components/braille-spinner";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type ContributionChannel,
  contributionChannelValues,
  type ContributionReportingMode,
  type DeductionEligible,
  type DonationType,
  donationTypeValues,
  GENERAL_FUND_ID,
  PROGRAMME_IDS,
} from "@pi-dash/shared/constants";
import {
  accountForChannel,
  CHANNEL_REPORTING_MODES,
  type ChannelAccount,
  type ChannelAccountSetup,
  channelAccountChoice,
  channelAccountIssue,
  isReportingModeFixed,
  RAZORPAY_CLEARING_ACCOUNT_CONFIG_KEY,
} from "@pi-dash/shared/contribution-channel";
import { DONATION_TYPE_PROGRAMME } from "@pi-dash/shared/contribution-programme";
import {
  ELIGIBILITY_REASON_PRESETS,
  TAX_CERTIFICATE_LABELS,
} from "@pi-dash/shared/donations-return";
import {
  CONTRIBUTION_CHANNEL_LABELS,
  DONATION_TYPE_LABELS,
  defaultReportingMode,
  REPORTING_MODE_LABELS,
} from "@pi-dash/shared/income";
import { rupeesToPaise } from "@pi-dash/shared/money";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";

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
import { epochToLocalDate, localDateToIso } from "@/lib/local-date";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";
import { paiseToRupeesInput } from "@/lib/paise";

import {
  buildFormSchema,
  type FormValues,
  OTHER_REASON,
} from "./contribution-form-schema";
import type { ContributionRow } from "./income-types";
import { withCurrentOption } from "./picker-options";
import {
  isGatewayContribution,
  useSettlementLock,
} from "./settlements/contribution-settlement";

const enumOptions = <T extends string>(
  values: readonly T[],
  labels: Record<T, string>
) => values.map((value) => ({ label: labels[value], value }));

const channelOptions = enumOptions(
  contributionChannelValues,
  CONTRIBUTION_CHANNEL_LABELS
);
/** A bank statement credit came by UPI, NEFT, cheque or cash. */
const directChannelOptions = channelOptions.filter((option) =>
  ["upi", "neft", "cheque", "cash"].includes(option.value)
);
const donationTypeOptions = enumOptions(
  donationTypeValues,
  DONATION_TYPE_LABELS
);
// Follow donor first: it is the default.
const taxCertificateOptions = enumOptions(
  ["unknown", "yes", "no"] as const satisfies readonly DeductionEligible[],
  TAX_CERTIFICATE_LABELS
);

const reasonOptions = [
  ...ELIGIBILITY_REASON_PRESETS.map((reason) => ({
    label: reason,
    value: reason as string,
  })),
  { label: "Other", value: OTHER_REASON },
];

/** Splits a stored reason into the picker's choice and the typed text. */
function reasonParts(reason: string | null | undefined): {
  eligibilityReasonChoice: string;
  eligibilityReasonOther: string;
} {
  const value = reason?.trim() ?? "";
  if (value === "") {
    return { eligibilityReasonChoice: "", eligibilityReasonOther: "" };
  }
  return (ELIGIBILITY_REASON_PRESETS as readonly string[]).includes(value)
    ? { eligibilityReasonChoice: value, eligibilityReasonOther: "" }
    : { eligibilityReasonChoice: OTHER_REASON, eligibilityReasonOther: value };
}

function reasonFrom(value: {
  eligibilityReasonChoice: string;
  eligibilityReasonOther: string;
}): string {
  return value.eligibilityReasonChoice === OTHER_REASON
    ? value.eligibilityReasonOther.trim()
    : value.eligibilityReasonChoice;
}

/**
 * A bank statement credit a donation is recorded from: its amount, account,
 * date, a channel guessed from the narration, and its reference. Saving
 * matches the line to the new contribution in the same transaction.
 */
export interface StatementLinePrefill {
  amountPaise: number;
  channel: ContributionChannel;
  id: string;
  orgAccountId: string;
  reference: string | null;
  /** The reference was read from the narration, so it is only a suggestion. */
  referenceFromNarration: boolean;
  /** yyyy-MM-dd */
  valueOn: string;
}

function valuesFromLine(
  fundId: string | undefined,
  line: StatementLinePrefill
): FormValues {
  return {
    ...emptyValues(fundId, null),
    amount: paiseToRupeesInput(line.amountPaise),
    channel: line.channel,
    orgAccountId: line.orgAccountId,
    receivedOn: new Date(`${line.valueOn}T00:00:00`),
    reference: line.reference ?? "",
    reportingMode: defaultReportingMode(
      line.channel
    ) as ContributionReportingMode,
  };
}

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
    deductionEligible: "unknown" as DeductionEligible,
    donationType: "voluntary" as DonationType,
    donationTypeDescription: "",
    eligibilityReasonChoice: "",
    eligibilityReasonOther: "",
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
    deductionEligible: (row.deductionEligible ??
      "unknown") as DeductionEligible,
    donationType: (row.donationType ?? "voluntary") as DonationType,
    donationTypeDescription: row.donationTypeDescription ?? "",
    ...reasonParts(
      row.deductionEligible === "no" ? row.eligibilityReason : null
    ),
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
    deductionEligible: value.deductionEligible,
    donationType: value.donationType,
    donationTypeDescription: value.donationTypeDescription || null,
    eligibilityReason:
      value.deductionEligible === "no" ? reasonFrom(value) || null : null,
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
  const [config] = useQuery(queries.appConfig.all());
  const [funds] = useQuery(queries.fund.active());
  const [programmes] = useQuery(queries.programme.active());
  // Project rows carry sponsor and budget terms, so only finance.view syncs them.
  const [projects] = useQuery(queries.project.all(), {
    enabled: hasPermission("finance.view"),
  });
  const programmeNames = new Map(programmes.map((p) => [p.id, p.name]));
  const projectLabel = (name: string, programmeName: string | undefined) =>
    `${name} (${programmeName ?? "No programme"})`;
  const razorpayClearingAccountId =
    config.find((c) => c.key === RAZORPAY_CLEARING_ACCOUNT_CONFIG_KEY)?.value ||
    null;
  return {
    accounts,
    /** The channel's accounts, plus the one the field holds if the channel rules it out. */
    accountOptions: (
      allowed: readonly ChannelAccount[],
      current: string | undefined
    ) => {
      const options = allowed.map((a) => ({ label: a.name, value: a.id }));
      const active = accounts.find((a) => a.id === current);
      if (active && !options.some((o) => o.value === current)) {
        return [...options, { label: active.name, value: active.id }];
      }
      return withCurrentOption(
        options,
        current,
        current === row?.orgAccountId ? row?.orgAccount?.name : undefined
      );
    },
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
    razorpayClearingAccountId,
  };
}

/** A gateway channel's fixed account, in words. */
const GATEWAY_ACCOUNT_NOTES: Partial<Record<ContributionChannel, string>> = {
  give_do: "give.do gifts land in the give.do clearing account.",
  razorpay: "Razorpay gifts land in the Razorpay clearing account.",
};

const CHEQUE_MODE_NOTE =
  "An account-payee cheque is reported as electronic; choose Other for a bearer cheque.";

/** Why the channel fixes the reporting mode, in words. */
function fixedModeNote(channel: ContributionChannel): string {
  return `Set by the channel: ${CONTRIBUTION_CHANNEL_LABELS[channel]} gifts are reported as ${REPORTING_MODE_LABELS[
    defaultReportingMode(channel)
  ].toLowerCase()}.`;
}

/** The reporting modes the channel allows, plus the one the field holds if it is ruled out. */
function reportingModeOptions(
  channel: ContributionChannel,
  current: ContributionReportingMode
) {
  const modes = CHANNEL_REPORTING_MODES[channel];
  return enumOptions(
    modes.includes(current) ? modes : [...modes, current],
    REPORTING_MODE_LABELS
  );
}

function ContributionForm({
  carried,
  contribution,
  fromLine,
  onOpenChange,
  onRecordAnother,
}: {
  carried: CarriedValues | null;
  contribution: ContributionRow | null;
  fromLine: StatementLinePrefill | null;
  onOpenChange: (open: boolean) => void;
  onRecordAnother: (carried: CarriedValues) => void;
}) {
  const zero = useZero();
  const isEdit = contribution !== null;
  // A refund recorded against it, or a processed gateway settlement that
  // paid it out, fixes what the provider reported; until the settlement is
  // known the fields stay fixed.
  const settlementLock = useSettlementLock(
    contribution?.id ?? null,
    contribution !== null && isGatewayContribution(contribution)
  );
  const hasRefund = (contribution?.refunds?.length ?? 0) > 0;
  const refundLocked = hasRefund || settlementLock !== "unlocked";
  const settlementProvider =
    contribution?.channel === "give_do" ? "give.do" : "Razorpay";
  const lockedNote = hasRefund
    ? "Fixed: a refund is recorded against this contribution."
    : refundLocked
      ? settlementLock === "locked"
        ? `Fixed: ${settlementProvider} has settled this contribution to the bank.`
        : `Fixed until pi-dash has checked whether ${settlementProvider} settled it.`
      : undefined;
  // Fixed for the life of the form so a retried save cannot duplicate.
  const [id] = useState(() => contribution?.id ?? uuidv7());
  const [donorDialogOpen, setDonorDialogOpen] = useState(false);
  const picker = usePickerOptions(contribution);
  const { accounts, razorpayClearingAccountId } = picker;
  const setup: ChannelAccountSetup = { razorpayClearingAccountId };
  // Stable while the accounts and settings are, so the form's validators
  // are not replaced on every render.
  const storedChannel = contribution?.channel ?? null;
  const storedAccountId = contribution?.orgAccountId ?? null;
  const formSchema = useMemo(
    () =>
      buildFormSchema(
        (channel, accountId) => {
          const account = accounts.find((a) => a.id === accountId);
          // An account that is no longer active is checked by the server.
          return account
            ? channelAccountIssue(channel, account, {
                razorpayClearingAccountId,
              })
            : null;
        },
        {
          locked: refundLocked,
          stored:
            storedChannel === null
              ? null
              : { channel: storedChannel, orgAccountId: storedAccountId },
        }
      ),
    [
      accounts,
      razorpayClearingAccountId,
      refundLocked,
      storedAccountId,
      storedChannel,
    ]
  );
  const defaultFundId =
    picker.funds.find((f) => f.id === GENERAL_FUND_ID)?.id ??
    picker.funds[0]?.id;

  const form = useForm({
    defaultValues: contribution
      ? valuesFor(contribution)
      : fromLine
        ? valuesFromLine(defaultFundId, fromLine)
        : emptyValues(defaultFundId, carried),
    listeners: {
      onChange: ({ fieldApi, formApi }) => {
        if (fieldApi.name === "channel") {
          const channel = formApi.getFieldValue("channel");
          formApi.setFieldValue("reportingMode", defaultReportingMode(channel));
          // A bank line fixes the account; otherwise the channel decides it.
          if (!fromLine) {
            formApi.setFieldValue(
              "orgAccountId",
              accountForChannel(
                channel,
                formApi.getFieldValue("orgAccountId"),
                picker.accounts,
                setup
              )
            );
          }
        }
        // A corpus gift has no programme or project.
        if (
          fieldApi.name === "donationType" &&
          DONATION_TYPE_PROGRAMME[formApi.getFieldValue("donationType")] ===
            "none"
        ) {
          formApi.setFieldValue("projectId", undefined);
          formApi.setFieldValue("programmeId", undefined);
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
        : mutators.contribution.create({
            ...args,
            statementLineId: fromLine?.id ?? null,
          });
      const res = await zero.mutate(mutation).server;
      handleMutationResult(res, {
        entityId: id,
        errorMsg: "Couldn't save contribution",
        mutation: isEdit ? "contribution.update" : "contribution.create",
        showErrorToast: false,
        successMsg: isEdit
          ? "Contribution updated"
          : fromLine
            ? "Donation recorded and matched to the bank line"
            : "Contribution recorded",
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

  // Accounts and settings can sync after a new form mounts: fill in the
  // channel's account then. An edited record keeps what it holds.
  const fillsAccount = !(isEdit || fromLine);
  useEffect(() => {
    if (!fillsAccount) {
      return;
    }
    const current = form.getFieldValue("orgAccountId");
    const next = accountForChannel(
      form.getFieldValue("channel"),
      current,
      accounts,
      { razorpayClearingAccountId }
    );
    if (next !== current) {
      // A default, not an edit: no validation, so untouched fields show no
      // errors yet.
      form.setFieldValue("orgAccountId", next, {
        dontUpdateMeta: true,
        dontValidate: true,
      });
    }
  }, [accounts, fillsAccount, form, razorpayClearingAccountId]);

  const cancel = useEventCallback(() => onOpenChange(false));
  const saveAndAnother = useEventCallback(() => {
    form.handleSubmit({ another: true });
  });
  const openDonorDialog = useEventCallback(() => setDonorDialogOpen(true));
  const clearProgramme = useEventCallback(() => {
    form.setFieldValue("projectId", undefined);
    form.setFieldValue("programmeId", undefined);
  });
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
            description={fromLine ? "From the bank line." : undefined}
            disabled={refundLocked || fromLine !== null}
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
            options={fromLine ? directChannelOptions : channelOptions}
          />
          <form.Subscribe
            selector={(state) => ({
              channel: state.values.channel,
              reportingMode: state.values.reportingMode,
            })}
          >
            {({ channel, reportingMode }) => {
              // Fixed by the channel, unless the record holds a mode the
              // channel rules out, which must stay changeable to fix it.
              const fixed =
                isReportingModeFixed(channel) &&
                reportingMode === defaultReportingMode(channel);
              return (
                <SelectField
                  description={
                    fixed
                      ? fixedModeNote(channel)
                      : channel === "cheque"
                        ? CHEQUE_MODE_NOTE
                        : undefined
                  }
                  disabled={fixed}
                  isRequired
                  label="Reporting mode"
                  name="reportingMode"
                  options={reportingModeOptions(channel, reportingMode)}
                />
              );
            }}
          </form.Subscribe>
        </div>
        <form.Subscribe
          selector={(state) => ({
            channel: state.values.channel,
            orgAccountId: state.values.orgAccountId,
            deductionEligible: state.values.deductionEligible,
            donationType: state.values.donationType,
            programmeId: state.values.programmeId,
            reasonChoice: state.values.eligibilityReasonChoice,
            projectId: state.values.projectId,
            reportingMode: state.values.reportingMode,
          })}
        >
          {({
            channel,
            deductionEligible,
            donationType,
            orgAccountId,
            programmeId,
            projectId,
            reasonChoice,
            reportingMode,
          }) => {
            const programmeNeed = DONATION_TYPE_PROGRAMME[donationType];
            // A corpus gift has no programme; one it still holds stays
            // visible so it can be cleared.
            const showProgramme =
              programmeNeed !== "none" || Boolean(programmeId || projectId);
            const accountChoice = channelAccountChoice(
              channel,
              picker.accounts,
              setup
            );
            // A gateway channel fixes the account once it holds the
            // gateway's; a record holding another stays changeable.
            const accountFixed =
              accountChoice.fixed &&
              orgAccountId === accountChoice.preferred?.id;
            return (
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
                    description={
                      fromLine
                        ? "From the bank line."
                        : accountFixed
                          ? GATEWAY_ACCOUNT_NOTES[channel]
                          : (accountChoice.emptyReason ?? undefined)
                    }
                    disabled={refundLocked || fromLine !== null || accountFixed}
                    emptyMessage={
                      accountChoice.emptyReason ?? "No accounts match."
                    }
                    isRequired
                    label="Deposited into"
                    name="orgAccountId"
                    options={picker.accountOptions(
                      accountChoice.allowed,
                      orgAccountId
                    )}
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
                <SelectField
                  description="Whether this gift goes in the donations return (Form 113). Follow donor uses the donor's own choice."
                  label="Tax certificate"
                  name="deductionEligible"
                  options={taxCertificateOptions}
                />
                {deductionEligible === "no" ? (
                  <SelectField
                    isRequired
                    label="Reason"
                    name="eligibilityReasonChoice"
                    options={reasonOptions}
                    placeholder="Why it is left out"
                  />
                ) : null}
                {deductionEligible === "no" && reasonChoice === OTHER_REASON ? (
                  <InputField
                    isRequired
                    label="Describe the reason"
                    name="eligibilityReasonOther"
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
                {showProgramme ? (
                  <ComboboxField
                    description={
                      projectId
                        ? "Set by the project."
                        : programmeNeed === "required"
                          ? "Grants and CSR gifts are for a named programme."
                          : undefined
                    }
                    disabled={Boolean(projectId)}
                    isRequired={programmeNeed === "required"}
                    label="Programme"
                    name="programmeId"
                    options={picker.programmeOptions}
                    placeholder="Search programmes..."
                  />
                ) : null}
                {showProgramme && picker.projectOptions.length > 0 ? (
                  <ComboboxField
                    label="Project"
                    name="projectId"
                    options={picker.projectOptions}
                    placeholder="Search projects..."
                  />
                ) : null}
                {programmeNeed === "none" && showProgramme ? (
                  // A corpus gift that still holds a programme or project
                  // (recorded before the rule). The project may not sync to
                  // this user, so one action clears both.
                  <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                    <p className="text-destructive text-sm">
                      A corpus gift has no programme or project.
                    </p>
                    <Button
                      onClick={clearProgramme}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Clear programme and project
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          }}
        </form.Subscribe>
        <FormSectionHeading>Reference</FormSectionHeading>
        <div className="grid gap-4">
          <InputField
            description={
              fromLine?.referenceFromNarration
                ? "Read from the bank's narration, so it may be wrong: clear it if it isn't this payment's UTR or reference."
                : "UTR, cheque number or gateway payment ID."
            }
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
              {isEdit || fromLine ? null : (
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
  fromLine = null,
  onOpenChange,
  open,
}: {
  contribution: ContributionRow | null;
  /** Record a donation from this bank statement credit, and match the line. */
  fromLine?: StatementLinePrefill | null;
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
            {isEdit
              ? "Edit contribution"
              : fromLine
                ? "Record donation from bank line"
                : "Record contribution"}
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
            fromLine={fromLine}
            key={`${contribution?.id ?? fromLine?.id ?? "new"}-${formKey}`}
            onOpenChange={handleOpenChange}
            onRecordAnother={handleRecordAnother}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
