import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  TRUSTEE_CESSATION_BASIS_LABELS,
  TRUSTEE_OFFICE_LABELS,
  TRUSTEE_TERM_BASIS_LABELS,
  type TrusteeCessationBasis,
  trusteeCessationBasisValues,
  type TrusteeOffice,
  trusteeOfficeValues,
  type TrusteeTermBasis,
  trusteeTermBasisValues,
} from "@pi-dash/shared/governance";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";

import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { FormSectionHeading } from "@/components/form/form-section";
import { SelectField } from "@/components/form/select-field";
import { TextareaField } from "@/components/form/textarea-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";

import {
  type DocumentOption,
  documentOptions,
  fromDocumentOption,
  NO_DOCUMENT,
} from "./evidence";
import { dateToIso, isoToDate, type RegisterTrustee } from "./register-data";

type Term = RegisterTrustee["terms"][number];
type Office = RegisterTrustee["offices"][number];

/** Far enough ahead for a term's or a registration's end. */
const FUTURE_MONTH = new Date(2100, 11, 1);

const basisOptions = trusteeTermBasisValues.map((value) => ({
  label: TRUSTEE_TERM_BASIS_LABELS[value],
  value,
}));
const cessationOptions = trusteeCessationBasisValues.map((value) => ({
  label: TRUSTEE_CESSATION_BASIS_LABELS[value],
  value,
}));
const officeOptions = trusteeOfficeValues.map((value) => ({
  label: TRUSTEE_OFFICE_LABELS[value],
  value,
}));

/** Runs a Zero mutation and reports the server's own message on failure. */
async function runMutation(
  pending: Promise<{ error?: unknown; type: string }>,
  options: {
    entityId: string;
    mutation: string;
    success: string;
    failure: string;
  }
): Promise<boolean> {
  const result = await pending;
  handleMutationResult(result, {
    entityId: options.entityId,
    errorMsg: `${options.failure}: ${getMutationResultErrorMessage(result.error, "something went wrong")}`,
    mutation: options.mutation,
    successMsg: options.success,
  });
  return result.type !== "error";
}

export type TermDialogState =
  | { mode: "create"; trustee: RegisterTrustee }
  | { mode: "edit" | "end"; term: Term; trustee: RegisterTrustee };

interface TermValues {
  basis: TrusteeTermBasis;
  acceptanceDocumentId: string;
  cessationBasis: string;
  endEvidenceDocumentId: string;
  endedOn: Date | undefined;
  endsOn: Date | undefined;
  startEvidenceDocumentId: string;
  startsOn: Date | undefined;
  validityNote: string;
}

const NO_CESSATION = "none";

function TermForm({
  documents,
  onDone,
  state,
}: {
  documents: readonly DocumentOption[];
  onDone: () => void;
  state: TermDialogState;
}) {
  const zero = useZero();
  const term = state.mode === "create" ? null : state.term;
  const docs = documentOptions(documents);
  const form = useForm({
    defaultValues: {
      acceptanceDocumentId: term?.acceptanceDocumentId ?? NO_DOCUMENT,
      basis: term?.basis ?? "co_option_4_5",
      cessationBasis: term?.cessationBasis ?? NO_CESSATION,
      endEvidenceDocumentId: term?.endEvidenceDocumentId ?? NO_DOCUMENT,
      endedOn: isoToDate(term?.endedOn),
      endsOn: isoToDate(term?.endsOn),
      startEvidenceDocumentId: term?.startEvidenceDocumentId ?? NO_DOCUMENT,
      startsOn: isoToDate(term?.startsOn),
      validityNote: term?.validityNote ?? "",
    } as TermValues,
    onSubmit: async ({ value }) => {
      const note = value.validityNote.trim() || null;
      let ok = false;
      if (state.mode === "end") {
        const endedOn = dateToIso(value.endedOn);
        if (!endedOn || value.cessationBasis === NO_CESSATION) {
          toast.error("Give the day the trustee ceased and the reason.");
          return;
        }
        ok = await runMutation(
          zero.mutate(
            mutators.trusteeTerm.end({
              cessationBasis: value.cessationBasis as TrusteeCessationBasis,
              endEvidenceDocumentId: fromDocumentOption(
                value.endEvidenceDocumentId
              ),
              endedOn,
              id: state.term.id,
              validityNote: note,
            })
          ).server,
          {
            entityId: state.term.id,
            failure: "Couldn't record the cessation",
            mutation: "trusteeTerm.end",
            success: "Cessation recorded",
          }
        );
      } else {
        const startsOn = dateToIso(value.startsOn);
        if (!startsOn) {
          toast.error("Give the day the term starts.");
          return;
        }
        const common = {
          acceptanceDocumentId: fromDocumentOption(value.acceptanceDocumentId),
          basis: value.basis,
          endsOn: dateToIso(value.endsOn),
          startEvidenceDocumentId: fromDocumentOption(
            value.startEvidenceDocumentId
          ),
          startsOn,
          validityNote: note,
        };
        ok =
          state.mode === "create"
            ? await runMutation(
                zero.mutate(
                  mutators.trusteeTerm.create({
                    ...common,
                    id: uuidv7(),
                    trusteeId: state.trustee.id,
                  })
                ).server,
                {
                  entityId: state.trustee.id,
                  failure: "Couldn't add the term",
                  mutation: "trusteeTerm.create",
                  success: "Term added",
                }
              )
            : await runMutation(
                zero.mutate(
                  mutators.trusteeTerm.update({
                    ...common,
                    cessationBasis:
                      value.cessationBasis === NO_CESSATION
                        ? null
                        : (value.cessationBasis as TrusteeCessationBasis),
                    endEvidenceDocumentId: fromDocumentOption(
                      value.endEvidenceDocumentId
                    ),
                    endedOn: dateToIso(value.endedOn),
                    id: state.term.id,
                  })
                ).server,
                {
                  entityId: state.term.id,
                  failure: "Couldn't correct the term",
                  mutation: "trusteeTerm.update",
                  success: "Term corrected",
                }
              );
      }
      if (ok) {
        onDone();
      }
    },
  });
  const cancel = useEventCallback(onDone);
  const showStart = state.mode !== "end";
  const showEnd = state.mode !== "create";

  return (
    <FormLayout form={form}>
      {showStart ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              isRequired
              label="Basis"
              name="basis"
              options={basisOptions}
            />
            <DateField
              endMonth={FUTURE_MONTH}
              isRequired
              label="Starts on"
              name="startsOn"
            />
            <DateField
              endMonth={FUTURE_MONTH}
              description="The last day of a fixed term. Leave empty for a life term (clause 4.4)."
              label="Ends on"
              name="endsOn"
            />
          </div>
          <SelectField
            description="The resolution, deed or letter that started the term."
            label="Evidence of the start"
            name="startEvidenceDocumentId"
            options={docs}
          />
          <SelectField
            description="The trustee's written acceptance (clause 4.24)."
            label="Acceptance"
            name="acceptanceDocumentId"
            options={docs}
          />
        </>
      ) : null}
      {showEnd ? (
        <>
          {state.mode === "edit" ? (
            <FormSectionHeading>Cessation</FormSectionHeading>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField
              endMonth={FUTURE_MONTH}
              description="The first day they were no longer a trustee."
              isRequired={state.mode === "end"}
              label="Ceased on"
              name="endedOn"
            />
            <SelectField
              isRequired={state.mode === "end"}
              label="Reason"
              name="cessationBasis"
              options={
                state.mode === "edit"
                  ? [
                      { label: "Still in office", value: NO_CESSATION },
                      ...cessationOptions,
                    ]
                  : cessationOptions
              }
            />
          </div>
          <SelectField
            description="The resignation, the resolution, or another record of the end."
            label="Evidence of the end"
            name="endEvidenceDocumentId"
            options={docs}
          />
        </>
      ) : null}
      <TextareaField
        description='What the record rests on and its limits, for example "meeting inquorate; relies on clause 4.5".'
        label="Validity note"
        name="validityNote"
        rows={2}
      />
      <FormActions
        disableWhenInvalid={false}
        onCancel={cancel}
        submitLabel={
          {
            create: "Add term",
            edit: "Save correction",
            end: "Record cessation",
          }[state.mode]
        }
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

export function TermDialog({
  documents,
  onOpenChange,
  state,
}: {
  documents: readonly DocumentOption[];
  onOpenChange: (open: boolean) => void;
  state: TermDialogState | null;
}) {
  const close = useEventCallback(() => onOpenChange(false));
  const titles = {
    create: "Add a term",
    edit: "Correct a term",
    end: "Record that a trustee ceased",
  };
  return (
    <Dialog onOpenChange={onOpenChange} open={state !== null}>
      <DialogContent className="sm:max-w-(--dialog-lg)">
        <DialogHeader>
          <DialogTitle>{state ? titles[state.mode] : ""}</DialogTitle>
          <DialogDescription>{state?.trustee.legalName}</DialogDescription>
        </DialogHeader>
        {state ? (
          <TermForm
            documents={documents}
            key={state.mode === "create" ? "new" : state.term.id}
            onDone={close}
            state={state}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export type OfficeDialogState =
  | { mode: "create"; trustee: RegisterTrustee }
  | { mode: "edit" | "end"; office: Office; trustee: RegisterTrustee };

interface OfficeValues {
  endEvidenceDocumentId: string;
  endedOn: Date | undefined;
  office: TrusteeOffice;
  startEvidenceDocumentId: string;
  startsOn: Date | undefined;
  validityNote: string;
}

function OfficeForm({
  documents,
  onDone,
  state,
}: {
  documents: readonly DocumentOption[];
  onDone: () => void;
  state: OfficeDialogState;
}) {
  const zero = useZero();
  const office = state.mode === "create" ? null : state.office;
  const docs = documentOptions(documents);
  const form = useForm({
    defaultValues: {
      endEvidenceDocumentId: office?.endEvidenceDocumentId ?? NO_DOCUMENT,
      endedOn: isoToDate(office?.endedOn),
      office: office?.office ?? "secretary",
      startEvidenceDocumentId: office?.startEvidenceDocumentId ?? NO_DOCUMENT,
      startsOn: isoToDate(office?.startsOn),
      validityNote: office?.validityNote ?? "",
    } as OfficeValues,
    onSubmit: async ({ value }) => {
      const note = value.validityNote.trim() || null;
      let ok = false;
      if (state.mode === "end") {
        const endedOn = dateToIso(value.endedOn);
        if (!endedOn) {
          toast.error("Give the day the office ended.");
          return;
        }
        ok = await runMutation(
          zero.mutate(
            mutators.trusteeOffice.end({
              endEvidenceDocumentId: fromDocumentOption(
                value.endEvidenceDocumentId
              ),
              endedOn,
              id: state.office.id,
              validityNote: note,
            })
          ).server,
          {
            entityId: state.office.id,
            failure: "Couldn't end the office",
            mutation: "trusteeOffice.end",
            success: "Office ended",
          }
        );
      } else {
        const startsOn = dateToIso(value.startsOn);
        if (!startsOn) {
          toast.error("Give the day the office starts.");
          return;
        }
        ok =
          state.mode === "create"
            ? await runMutation(
                zero.mutate(
                  mutators.trusteeOffice.create({
                    id: uuidv7(),
                    office: value.office,
                    startEvidenceDocumentId: fromDocumentOption(
                      value.startEvidenceDocumentId
                    ),
                    startsOn,
                    trusteeId: state.trustee.id,
                    validityNote: note,
                  })
                ).server,
                {
                  entityId: state.trustee.id,
                  failure: "Couldn't add the office",
                  mutation: "trusteeOffice.create",
                  success: "Office added",
                }
              )
            : await runMutation(
                zero.mutate(
                  mutators.trusteeOffice.update({
                    endEvidenceDocumentId: fromDocumentOption(
                      value.endEvidenceDocumentId
                    ),
                    endedOn: dateToIso(value.endedOn),
                    id: state.office.id,
                    office: value.office,
                    startEvidenceDocumentId: fromDocumentOption(
                      value.startEvidenceDocumentId
                    ),
                    startsOn,
                    validityNote: note,
                  })
                ).server,
                {
                  entityId: state.office.id,
                  failure: "Couldn't correct the office",
                  mutation: "trusteeOffice.update",
                  success: "Office corrected",
                }
              );
      }
      if (ok) {
        onDone();
      }
    },
  });
  const cancel = useEventCallback(onDone);

  return (
    <FormLayout form={form}>
      {state.mode === "end" ? null : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              isRequired
              label="Office"
              name="office"
              options={officeOptions}
            />
            <DateField
              endMonth={FUTURE_MONTH}
              isRequired
              label="Starts on"
              name="startsOn"
            />
          </div>
          <SelectField
            description="The resolution that designated them."
            label="Evidence of the start"
            name="startEvidenceDocumentId"
            options={docs}
          />
        </>
      )}
      {state.mode === "create" ? null : (
        <>
          <DateField
            endMonth={FUTURE_MONTH}
            description="The first day they no longer held the office. An office ends with the holder's term without this."
            isRequired={state.mode === "end"}
            label="Ended on"
            name="endedOn"
          />
          <SelectField
            label="Evidence of the end"
            name="endEvidenceDocumentId"
            options={docs}
          />
        </>
      )}
      <TextareaField label="Validity note" name="validityNote" rows={2} />
      <FormActions
        disableWhenInvalid={false}
        onCancel={cancel}
        submitLabel={
          { create: "Add office", edit: "Save correction", end: "End office" }[
            state.mode
          ]
        }
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

export function OfficeDialog({
  documents,
  onOpenChange,
  state,
}: {
  documents: readonly DocumentOption[];
  onOpenChange: (open: boolean) => void;
  state: OfficeDialogState | null;
}) {
  const close = useEventCallback(() => onOpenChange(false));
  const titles = {
    create: "Add an office",
    edit: "Correct an office",
    end: "End an office",
  };
  return (
    <Dialog onOpenChange={onOpenChange} open={state !== null}>
      <DialogContent className="sm:max-w-(--dialog-lg)">
        <DialogHeader>
          <DialogTitle>{state ? titles[state.mode] : ""}</DialogTitle>
          <DialogDescription>{state?.trustee.legalName}</DialogDescription>
        </DialogHeader>
        {state ? (
          <OfficeForm
            documents={documents}
            key={state.mode === "create" ? "new" : state.office.id}
            onDone={close}
            state={state}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
