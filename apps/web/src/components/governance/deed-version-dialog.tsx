import {
  type DeedRules,
  RESOLUTION_THRESHOLD_LABELS,
  resolutionThresholdValues,
  TRUSTEE_OFFICE_LABELS,
  type TrusteeOffice,
  trusteeOfficeValues,
} from "@pi-dash/shared/governance";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { uuidv7 } from "uuidv7";

import { CheckboxField } from "@/components/form/checkbox-field";
import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { FormModal } from "@/components/form/form-modal";
import { FormSectionHeading } from "@/components/form/form-section";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";

import type { DocumentOption } from "./evidence";
import { dateToIso, formatIso } from "./register-data";

const FUTURE_MONTH = new Date(2100, 11, 1);
const NONE = "none";

const officeOptions = trusteeOfficeValues.map((value) => ({
  label: TRUSTEE_OFFICE_LABELS[value],
  value,
}));

interface Values {
  amendmentThreshold: DeedRules["amendmentThreshold"];
  castingVote: DeedRules["castingVote"];
  coOptionMaxYears: number;
  documentId: string;
  effectiveFrom: Date | undefined;
  electronicCirculation: boolean;
  fallbackIssuer: string;
  firstIssuer: TrusteeOffice;
  maxTrustees: number;
  minTrustees: number;
  noticeDays: number;
  quorumFloor: number;
  quorumKind: DeedRules["quorumKind"];
  quorumRequiredOffice: string;
  quorumValue: number;
  title: string;
  videoCountsPresent: boolean;
}

function valuesFrom(rules: DeedRules): Values {
  return {
    amendmentThreshold: rules.amendmentThreshold,
    castingVote: rules.castingVote,
    coOptionMaxYears: rules.coOptionMaxYears,
    documentId: NONE,
    effectiveFrom: undefined,
    electronicCirculation: rules.electronicCirculation,
    fallbackIssuer: rules.circularIssuers[1] ?? NONE,
    firstIssuer: rules.circularIssuers[0] ?? "managing_trustee",
    maxTrustees: rules.maxTrustees,
    minTrustees: rules.minTrustees,
    noticeDays: rules.noticeDays,
    quorumFloor: rules.quorumFloor,
    quorumKind: rules.quorumKind,
    quorumRequiredOffice: rules.quorumRequiredOffice ?? NONE,
    quorumValue: rules.quorumValue,
    title: "",
    videoCountsPresent: rules.videoCountsPresent,
  };
}

/**
 * Records a registered deed of amendment as the next deed version, starting
 * from the rules of the version before it.
 */
export function DeedVersionDialog({
  documents,
  latest,
  onOpenChange,
  open,
}: {
  documents: readonly DocumentOption[];
  latest: DeedRules;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <FormModal
      description="Record the rules of a registered deed of amendment. They apply to meetings and resolutions from the day it takes effect; earlier decisions keep the rules of their date."
      onOpenChange={onOpenChange}
      open={open}
      title="Add a deed version"
    >
      {open ? (
        <DeedVersionForm
          documents={documents}
          latest={latest}
          onDone={() => onOpenChange(false)}
        />
      ) : null}
    </FormModal>
  );
}

function DeedVersionForm({
  documents,
  latest,
  onDone,
}: {
  documents: readonly DocumentOption[];
  latest: DeedRules;
  onDone: () => void;
}) {
  const zero = useZero();
  const form = useForm({
    defaultValues: valuesFrom(latest),
    onSubmit: async ({ value }) => {
      const effectiveFrom = dateToIso(value.effectiveFrom);
      if (!effectiveFrom) {
        return;
      }
      const id = uuidv7();
      const issuers: TrusteeOffice[] = [value.firstIssuer];
      if (
        value.fallbackIssuer !== NONE &&
        value.fallbackIssuer !== value.firstIssuer
      ) {
        issuers.push(value.fallbackIssuer as TrusteeOffice);
      }
      const result = await zero.mutate(
        mutators.deedVersion.create({
          amendmentThreshold: value.amendmentThreshold,
          castingVote: value.castingVote,
          circularIssuers: issuers,
          coOptionMaxYears: value.coOptionMaxYears,
          documentId: value.documentId === NONE ? null : value.documentId,
          effectiveFrom,
          electronicCirculation: value.electronicCirculation,
          id,
          maxTrustees: value.maxTrustees,
          minTrustees: value.minTrustees,
          noticeDays: value.noticeDays,
          quorumFloor: value.quorumFloor,
          quorumKind: value.quorumKind,
          quorumRequiredOffice:
            value.quorumRequiredOffice === NONE
              ? null
              : (value.quorumRequiredOffice as TrusteeOffice),
          quorumValue: value.quorumValue,
          title: value.title.trim(),
          videoCountsPresent: value.videoCountsPresent,
        })
      ).server;
      handleMutationResult(result, {
        entityId: id,
        errorMsg: `Couldn't add the version: ${getMutationResultErrorMessage(result.type === "error" ? result.error : undefined, "something went wrong")}`,
        mutation: "deedVersion.create",
        successMsg: "Deed version added",
      });
      if (result.type !== "error") {
        onDone();
      }
    },
  });
  const deeds = documents.filter(
    (d) => d.kind === "trust_deed" || d.kind === "deed_amendment"
  );

  return (
    <FormLayout form={form}>
      <InputField
        isRequired
        label="Title"
        name="title"
        placeholder="Deed of amendment, Doc. No. …"
        validators={{
          onSubmit: ({ value }) =>
            String(value).trim() ? undefined : "Give the deed a title",
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          endMonth={FUTURE_MONTH}
          isRequired
          label="Takes effect"
          name="effectiveFrom"
          validators={{
            onSubmit: ({ value }) =>
              value ? undefined : "Give the day it takes effect",
          }}
        />
        <SelectField
          label="Registered copy"
          name="documentId"
          options={[
            { label: "Not in the vault yet", value: NONE },
            ...deeds.map((d) => ({
              label: `${d.title} · ${formatIso(d.datedOn)}`,
              value: d.id,
            })),
          ]}
        />
      </div>
      <FormSectionHeading>Board</FormSectionHeading>
      <div className="grid gap-4 sm:grid-cols-3">
        <InputField
          isRequired
          label="Fewest trustees"
          min={1}
          name="minTrustees"
          type="number"
        />
        <InputField
          isRequired
          label="Most trustees"
          min={1}
          name="maxTrustees"
          type="number"
        />
        <InputField
          isRequired
          label="Co-option, years at a time"
          min={0}
          name="coOptionMaxYears"
          type="number"
        />
      </div>
      <FormSectionHeading>Meetings</FormSectionHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          isRequired
          label="Quorum"
          name="quorumKind"
          options={[
            { label: "A number of trustees", value: "fixed" },
            { label: "A share of the trustees in office", value: "fraction" },
          ]}
        />
        <form.Subscribe selector={(s) => s.values.quorumKind}>
          {(kind) => (
            <InputField
              isRequired
              label={
                kind === "fixed"
                  ? "Trustees needed"
                  : "Percent of trustees in office"
              }
              min={1}
              name="quorumValue"
              type="number"
            />
          )}
        </form.Subscribe>
        <InputField
          description="Never fewer than this many present, whatever the share gives."
          isRequired
          label="Quorum floor"
          min={0}
          name="quorumFloor"
          type="number"
        />
        <SelectField
          label="Must be present for a quorum"
          name="quorumRequiredOffice"
          options={[
            { label: "No one in particular", value: NONE },
            ...officeOptions,
          ]}
        />
        <InputField
          isRequired
          label="Days of notice"
          min={0}
          name="noticeDays"
          type="number"
        />
        <SelectField
          isRequired
          label="Casting vote on a tie"
          name="castingVote"
          options={[
            { label: "The chair of the meeting", value: "chair" },
            { label: "The Co-Founders", value: "co_founders" },
            { label: "None", value: "none" },
          ]}
        />
      </div>
      <CheckboxField
        label="A trustee on video counts as present"
        name="videoCountsPresent"
      />
      <FormSectionHeading>Circulars and amendments</FormSectionHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          isRequired
          label="Circulars issued by"
          name="firstIssuer"
          options={officeOptions}
        />
        <SelectField
          label="Or, when that office is vacant"
          name="fallbackIssuer"
          options={[{ label: "No one else", value: NONE }, ...officeOptions]}
        />
        <SelectField
          isRequired
          label="Amending the deed needs"
          name="amendmentThreshold"
          options={resolutionThresholdValues.map((value) => ({
            label: RESOLUTION_THRESHOLD_LABELS[value],
            value,
          }))}
        />
      </div>
      <CheckboxField
        label="Circulation by email with electronic signatures"
        name="electronicCirculation"
      />
      <FormActions
        disableWhenInvalid={false}
        onCancel={onDone}
        submitLabel="Add version"
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}
