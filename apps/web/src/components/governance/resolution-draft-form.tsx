import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  TRUSTEE_CESSATION_BASIS_LABELS,
  TRUSTEE_OFFICE_LABELS,
  TRUSTEE_TERM_BASIS_LABELS,
} from "@pi-dash/shared/governance";
import {
  RESOLUTION_EFFECT_VALUES,
  RESOLUTION_TEMPLATES,
  type ResolutionEffect,
  type ResolutionTemplateKey,
  resolutionTemplateKeyValues,
} from "@pi-dash/shared/resolutions";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useRef } from "react";
import { toast } from "sonner";

import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { FormSectionHeading } from "@/components/form/form-section";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import { TextareaField } from "@/components/form/textarea-field";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";

import { dateToIso, isoToDate, type RegisterTrustee } from "./register-data";

const FUTURE_MONTH = new Date(2100, 11, 1);

const templateOptions = resolutionTemplateKeyValues.map((key) => ({
  label: RESOLUTION_TEMPLATES[key].title,
  value: key,
}));
const basisOptions = RESOLUTION_EFFECT_VALUES.basis.map((value) => ({
  label: TRUSTEE_TERM_BASIS_LABELS[value],
  value,
}));
const cessationOptions = RESOLUTION_EFFECT_VALUES.cessationBasis.map(
  (value) => ({ label: TRUSTEE_CESSATION_BASIS_LABELS[value], value })
);
const officeOptions = RESOLUTION_EFFECT_VALUES.office.map((value) => ({
  label: TRUSTEE_OFFICE_LABELS[value],
  value,
}));

export interface DraftValues {
  basis: string;
  body: string;
  cessationBasis: string;
  endedOn: Date | undefined;
  endsOn: Date | undefined;
  hearingNote: string;
  hearingOn: Date | undefined;
  office: string;
  startsOn: Date | undefined;
  templateKey: ResolutionTemplateKey;
  title: string;
  trusteeId: string;
}

export function draftValuesFrom(draft: {
  body: string;
  effect: ResolutionEffect;
  templateKey: ResolutionTemplateKey;
  title: string;
}): DraftValues {
  const e = draft.effect;
  return {
    basis: e.type === "term_start" ? e.basis : "co_option_4_5",
    body: draft.body,
    cessationBasis: e.type === "term_end" ? e.cessationBasis : "resignation",
    endedOn: isoToDate(
      e.type === "term_end" || e.type === "removal" ? e.endedOn : null
    ),
    endsOn: isoToDate(e.type === "term_start" ? e.endsOn : null),
    hearingNote: e.type === "removal" ? e.hearingNote : "",
    hearingOn: isoToDate(e.type === "removal" ? e.hearingOn : null),
    office: e.type === "office_start" ? e.office : "secretary",
    startsOn: isoToDate(
      e.type === "term_start" || e.type === "office_start" ? e.startsOn : null
    ),
    templateKey: draft.templateKey,
    title: draft.title,
    trusteeId: e.type === "none" ? "" : e.trusteeId,
  };
}

/** The register change the values describe, or why they don't yet. */
export function effectFrom(
  values: DraftValues
): { effect: ResolutionEffect } | { problem: string } {
  const template = RESOLUTION_TEMPLATES[values.templateKey];
  if (template.effect === "none") {
    return { effect: { type: "none" } };
  }
  if (!values.trusteeId) {
    return { problem: "Choose the trustee." };
  }
  const trusteeId = values.trusteeId;
  switch (template.effect) {
    case "term_start": {
      const startsOn = dateToIso(values.startsOn);
      if (!startsOn) {
        return { problem: "Give the day the term starts." };
      }
      return {
        effect: {
          basis: values.basis as Extract<
            ResolutionEffect,
            { type: "term_start" }
          >["basis"],
          endsOn: dateToIso(values.endsOn),
          startsOn,
          trusteeId,
          type: "term_start",
        },
      };
    }
    case "term_end": {
      const endedOn = dateToIso(values.endedOn);
      if (!endedOn) {
        return { problem: "Give the day the trustee ceased." };
      }
      return {
        effect: {
          cessationBasis: values.cessationBasis as Extract<
            ResolutionEffect,
            { type: "term_end" }
          >["cessationBasis"],
          endedOn,
          trusteeId,
          type: "term_end",
        },
      };
    }
    case "office_start": {
      const startsOn = dateToIso(values.startsOn);
      if (!startsOn) {
        return { problem: "Give the day the office starts." };
      }
      return {
        effect: {
          office: values.office as Extract<
            ResolutionEffect,
            { type: "office_start" }
          >["office"],
          startsOn,
          trusteeId,
          type: "office_start",
        },
      };
    }
    case "removal": {
      const endedOn = dateToIso(values.endedOn);
      const hearingOn = dateToIso(values.hearingOn);
      if (!(endedOn && hearingOn)) {
        return {
          problem:
            "Give the hearing date and the day the removal takes effect.",
        };
      }
      return {
        effect: {
          endedOn,
          hearingNote: values.hearingNote.trim(),
          hearingOn,
          trusteeId,
          type: "removal",
        },
      };
    }
    default:
      return { problem: "Unknown template" };
  }
}

/** Creates or edits a draft circular. */
export function ResolutionDraftForm({
  draftId,
  initial,
  mode,
  onCancel,
  onSaved,
  trustees,
}: {
  draftId: string;
  initial: DraftValues;
  mode: "create" | "update";
  onCancel: () => void;
  onSaved: (id: string) => void;
  trustees: readonly RegisterTrustee[];
}) {
  const zero = useZero();
  // The template the text was last filled from, to know whether it was edited.
  const lastTemplate = useRef(initial.templateKey);
  const form = useForm({
    defaultValues: initial,
    listeners: {
      onChange: ({ fieldApi, formApi }) => {
        if (fieldApi.name !== "templateKey") {
          return;
        }
        const previous = RESOLUTION_TEMPLATES[lastTemplate.current];
        const key = formApi.getFieldValue("templateKey");
        const next = RESOLUTION_TEMPLATES[key];
        lastTemplate.current = key;
        const body = formApi.getFieldValue("body");
        if (!body.trim() || body === previous.text) {
          formApi.setFieldValue("body", next.text);
        }
        const title = formApi.getFieldValue("title");
        if (!title.trim() || title === previous.title) {
          formApi.setFieldValue("title", next.title);
        }
      },
    },
    onSubmit: async ({ value }) => {
      const result = effectFrom(value);
      if ("problem" in result) {
        toast.error(result.problem);
        return;
      }
      const args = {
        body: value.body,
        effect: result.effect,
        id: draftId,
        templateKey: value.templateKey,
        title: value.title.trim(),
      };
      const outcome = await zero.mutate(
        mode === "create"
          ? mutators.resolution.createDraft(args)
          : mutators.resolution.updateDraft(args)
      ).server;
      handleMutationResult(outcome, {
        entityId: draftId,
        errorMsg: `Couldn't save the draft: ${getMutationResultErrorMessage(outcome.type === "error" ? outcome.error : undefined, "something went wrong")}`,
        mutation:
          mode === "create"
            ? "resolution.createDraft"
            : "resolution.updateDraft",
        successMsg: mode === "create" ? "Draft created" : "Draft saved",
      });
      if (outcome.type !== "error") {
        onSaved(draftId);
      }
    },
  });
  const cancel = useEventCallback(onCancel);
  const trusteeOptions = trustees.map((t) => ({
    label: t.legalName,
    value: t.id,
  }));

  return (
    <FormLayout form={form}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          isRequired
          label="Template"
          name="templateKey"
          options={templateOptions}
        />
        <InputField isRequired label="Title" name="title" />
      </div>
      <form.Subscribe selector={(s) => s.values.templateKey}>
        {(templateKey) => {
          const template = RESOLUTION_TEMPLATES[templateKey];
          return (
            <>
              <p className="text-muted-foreground text-sm">
                {template.description}
              </p>
              <TextareaField
                description="Separate paragraphs with a blank line. The text can't change once the circular is issued."
                isRequired
                label="Text"
                name="body"
                rows={8}
              />
              {template.effect === "none" ? null : (
                <>
                  <FormSectionHeading>
                    Register change when it passes
                  </FormSectionHeading>
                  <SelectField
                    isRequired
                    label="Trustee"
                    name="trusteeId"
                    options={trusteeOptions}
                    placeholder="Choose a trustee"
                  />
                </>
              )}
              {template.effect === "term_start" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label="Basis"
                    name="basis"
                    options={basisOptions}
                  />
                  <DateField
                    endMonth={FUTURE_MONTH}
                    isRequired
                    label="Term starts"
                    name="startsOn"
                  />
                  <DateField
                    description="The last day of the term; empty for life."
                    endMonth={FUTURE_MONTH}
                    label="Term ends"
                    name="endsOn"
                  />
                </div>
              ) : null}
              {template.effect === "term_end" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label="Reason"
                    name="cessationBasis"
                    options={cessationOptions}
                  />
                  <DateField
                    description="The first day they are no longer a trustee."
                    endMonth={FUTURE_MONTH}
                    isRequired
                    label="Ceased on"
                    name="endedOn"
                  />
                </div>
              ) : null}
              {template.effect === "office_start" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label="Office"
                    name="office"
                    options={officeOptions}
                  />
                  <DateField
                    description="The previous holder's office ends the same day."
                    endMonth={FUTURE_MONTH}
                    isRequired
                    label="Starts on"
                    name="startsOn"
                  />
                </div>
              ) : null}
              {template.effect === "removal" ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DateField
                      isRequired
                      label="Hearing held on"
                      name="hearingOn"
                    />
                    <DateField
                      endMonth={FUTURE_MONTH}
                      isRequired
                      label="Removal takes effect"
                      name="endedOn"
                    />
                  </div>
                  <TextareaField
                    description="What the trustee said at the hearing and the Board's reasons, in writing (clause 7.12)."
                    isRequired
                    label="Hearing and reasons"
                    name="hearingNote"
                    rows={4}
                  />
                </>
              ) : null}
            </>
          );
        }}
      </form.Subscribe>
      <FormActions
        disableWhenInvalid={false}
        onCancel={cancel}
        submitLabel={mode === "create" ? "Create draft" : "Save draft"}
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}
