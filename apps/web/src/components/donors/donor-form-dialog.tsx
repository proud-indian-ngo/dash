import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  foreignSourceAssessmentValues,
  partyIdTypeValues,
  type PartyKind,
  partyKindValues,
} from "@pi-dash/shared/constants";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { CheckboxField } from "@/components/form/checkbox-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { FormSectionHeading } from "@/components/form/form-section";
import { InputField } from "@/components/form/input-field";
import { PhoneField } from "@/components/form/phone-field-lazy";
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
  getPartyDetails,
  type PartyDetailsResponse,
  saveDonor,
} from "@/functions/parties";
import {
  ASSESSMENT_LABELS,
  DIRECTORY_ROLES,
  type DirectoryRole,
  donorFieldsSchema,
  ID_TYPE_LABELS,
  needsIdNumber,
  panCheck,
  type SaveDonorInput,
  saveDonorSchema,
} from "@/lib/donor-schema";
import { isSaveConflict } from "@/lib/save-conflict";

import { type PartyRow, ROLE_LABELS } from "./party-row";

const kindOptions = partyKindValues.map((value) => ({
  label: value === "organisation" ? "Organisation" : "Person",
  value,
}));
const idTypeOptions = partyIdTypeValues.map((value) => ({
  label: ID_TYPE_LABELS[value],
  value,
}));
const assessmentOptions = foreignSourceAssessmentValues.map((value) => ({
  label: ASSESSMENT_LABELS[value],
  value,
}));

/** The form keeps roles as booleans so each is a checkbox; the server gets a list. */
type DonorFormValues = Omit<
  SaveDonorInput,
  "expectedPartyUpdatedAt" | "expectedUpdatedAt" | "id" | "mode" | "roles"
> &
  Record<`role_${DirectoryRole}`, boolean>;

const formSchema = donorFieldsSchema
  .omit({
    expectedPartyUpdatedAt: true,
    expectedUpdatedAt: true,
    id: true,
    mode: true,
    roles: true,
  })
  .extend({
    role_donor: z.boolean(),
    role_grantor: z.boolean(),
    role_intermediary: z.boolean(),
    role_sponsor: z.boolean(),
  })
  .refine(panCheck.check, { message: panCheck.message, path: ["idNumber"] })
  .refine(
    (v) =>
      v.role_donor || v.role_sponsor || v.role_grantor || v.role_intermediary,
    { message: "Pick at least one role", path: ["role_donor"] }
  );

function emptyValues(): DonorFormValues {
  return {
    addressLine1: "",
    addressLine2: "",
    assessmentNote: "",
    city: "",
    country: "IN",
    displayName: "",
    email: "",
    foreignSourceAssessment: "domestic",
    idNumber: "",
    idType: "none",
    kind: "person",
    legalName: "",
    nationality: "",
    phone: "",
    pincode: "",
    role_donor: true,
    role_grantor: false,
    role_intermediary: false,
    role_sponsor: false,
    state: "",
  };
}

function valuesFor(
  party: PartyRow,
  details: PartyDetailsResponse["details"]
): DonorFormValues {
  const active = new Set(
    party.roles.filter((r) => r.active).map((r) => r.role)
  );
  return {
    ...emptyValues(),
    addressLine1: details?.addressLine1 ?? "",
    addressLine2: details?.addressLine2 ?? "",
    assessmentNote: details?.assessmentNote ?? "",
    city: details?.city ?? "",
    country: details?.country ?? "IN",
    displayName: party.displayName,
    email: details?.email ?? "",
    foreignSourceAssessment: details?.foreignSourceAssessment ?? "domestic",
    idType: details?.idType ?? "none",
    kind: party.kind as PartyKind,
    legalName: party.legalName ?? "",
    nationality: details?.nationality ?? "",
    phone: details?.phone ?? "",
    pincode: details?.pincode ?? "",
    role_donor: active.has("donor"),
    role_grantor: active.has("grantor"),
    role_intermediary: active.has("intermediary"),
    role_sponsor: active.has("sponsor"),
    state: details?.state ?? "",
  };
}

function toInput(
  partyId: string,
  party: PartyRow | null,
  details: PartyDetailsResponse["details"],
  value: DonorFormValues
): SaveDonorInput {
  const { role_donor, role_grantor, role_intermediary, role_sponsor, ...rest } =
    value;
  const flags: Record<DirectoryRole, boolean> = {
    donor: role_donor,
    grantor: role_grantor,
    intermediary: role_intermediary,
    sponsor: role_sponsor,
  };
  return {
    ...rest,
    expectedPartyUpdatedAt: party?.updatedAt ?? null,
    expectedUpdatedAt: details?.updatedAt ?? null,
    id: partyId,
    mode: party ? "update" : "create",
    roles: DIRECTORY_ROLES.filter((role) => flags[role]),
  };
}

function DonorForm({
  context,
  onConflict,
  onOpenChange,
  onSaved,
  party,
}: {
  context: PartyDetailsResponse;
  /** Reloads the details after someone else saved the donor first. */
  onConflict: () => void;
  onOpenChange: (open: boolean) => void;
  onSaved: (partyId: string) => void;
  party: PartyRow | null;
}) {
  const save = useServerFn(saveDonor);
  const isEdit = party !== null;
  const details = context.details;
  // Fixed for the life of the form so a retried create cannot duplicate.
  const [partyId] = useState(() => party?.id ?? uuidv7());

  const form = useForm({
    defaultValues: party ? valuesFor(party, details) : emptyValues(),
    onSubmit: async ({ value }) => {
      if (needsIdNumber(value, details)) {
        toast.error("Enter the ID number or set the ID type to none");
        return;
      }
      const input = toInput(partyId, party, details, value);
      const check = saveDonorSchema.safeParse(input);
      if (!check.success) {
        toast.error(check.error.issues[0]?.message ?? "Check the form");
        return;
      }
      try {
        const result = await save({ data: check.data });
        toast.success(isEdit ? "Donor updated" : "Donor created");
        onSaved(result.partyId);
        onOpenChange(false);
      } catch (error) {
        log.error({
          action: isEdit ? "donor.update" : "donor.create",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "DonorFormDialog",
        });
        if (isSaveConflict(error)) {
          toast.error("Someone else changed this donor", {
            description:
              "The latest details are loaded. Review them and save again.",
          });
          onConflict();
          return;
        }
        toast.error(
          isEdit ? "Couldn't update donor" : "Couldn't create donor",
          {
            description:
              error instanceof Error ? error.message : "Something went wrong",
          }
        );
      }
    },
    validators: { onChange: formSchema, onSubmit: formSchema },
  });
  const cancel = useEventCallback(() => onOpenChange(false));

  let idHint =
    "Needed for the donation statement (Form 113) when the donor claims a deduction.";
  if (!context.identifiersAvailable) {
    idHint =
      "Identifiers cannot be stored until the encryption key is configured.";
  } else if (isEdit && details?.hasIdNumber) {
    idHint = `Stored${details.idNumberLast4 ? `, ending ${details.idNumberLast4}` : ""}. Leave blank to keep it, or enter a new number to replace it.`;
  }

  return (
    <FormLayout form={form}>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField isRequired label="Name" name="displayName" />
        <SelectField
          isRequired
          label="Kind"
          name="kind"
          options={kindOptions}
        />
        <InputField
          description="As on the PAN card or registration, if different."
          label="Legal name"
          name="legalName"
        />
      </div>

      <FormSectionHeading>Roles</FormSectionHeading>
      <div className="grid gap-2 sm:grid-cols-2">
        {DIRECTORY_ROLES.map((role) => (
          <CheckboxField
            key={role}
            label={ROLE_LABELS[role]}
            name={`role_${role}`}
          />
        ))}
      </div>

      <FormSectionHeading>Contact</FormSectionHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField label="Email" name="email" type="email" />
        <PhoneField defaultCountry="IN" label="Phone" name="phone" />
        <InputField label="Address line 1" name="addressLine1" />
        <InputField label="Address line 2" name="addressLine2" />
        <InputField label="City" name="city" />
        <InputField label="State" name="state" />
        <InputField label="PIN code" name="pincode" />
        <InputField
          description="Two-letter code, for example IN."
          label="Country"
          name="country"
        />
      </div>

      <FormSectionHeading>Identity and source</FormSectionHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          disabled={!context.identifiersAvailable}
          label="ID type"
          name="idType"
          options={idTypeOptions}
        />
        <InputField
          description={idHint}
          disabled={!context.identifiersAvailable}
          label="ID number"
          name="idNumber"
        />
        <SelectField
          description="Foreign-source money needs FCRA registration before it can be accepted."
          label="Source"
          name="foreignSourceAssessment"
          options={assessmentOptions}
        />
        <InputField label="Nationality" name="nationality" />
      </div>
      <TextareaField label="Assessment note" name="assessmentNote" rows={2} />

      <FormActions
        disableWhenInvalid={false}
        onCancel={cancel}
        submitLabel={isEdit ? "Save changes" : "Add donor"}
        submittingLabel={isEdit ? "Saving..." : "Creating..."}
      />
    </FormLayout>
  );
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; context: PartyDetailsResponse };

export function DonorFormDialog({
  onOpenChange,
  onSaved,
  open,
  party,
}: {
  onOpenChange: (open: boolean) => void;
  onSaved: (partyId: string) => void;
  open: boolean;
  party: PartyRow | null;
}) {
  const loadDetails = useServerFn(getPartyDetails);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const partyId = party?.id ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    // Reset on open, not on close, so the content does not flash to a
    // loading state during the close animation.
    setState({ kind: "loading" });
    loadDetails({ data: { partyId } })
      .then((context) => {
        if (!cancelled) {
          setState({ context, kind: "ready" });
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "donor.loadDetails",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "DonorFormDialog",
        });
        if (!cancelled) {
          // Never show an empty form for an existing donor: saving it would
          // wipe the stored details.
          setState({
            kind: "error",
            message: "Couldn't load the donor's details.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, partyId, attempt, loadDetails]);

  const retry = useEventCallback(() => setAttempt((n) => n + 1));

  let body: React.ReactNode;
  if (state.kind === "ready") {
    body = (
      <DonorForm
        context={state.context}
        // A reload after a conflict remounts the form with the fresh details.
        key={`${partyId ?? "new"}-${attempt}`}
        onConflict={retry}
        onOpenChange={onOpenChange}
        onSaved={onSaved}
        party={party}
      />
    );
  } else if (state.kind === "error") {
    body = (
      <div className="flex flex-col items-start gap-3 px-1 py-4">
        <p className="text-destructive text-sm">{state.message}</p>
        <Button onClick={retry} size="sm" type="button" variant="outline">
          Try again
        </Button>
      </div>
    );
  } else {
    body = <p className="text-muted-foreground px-1 py-6 text-sm">Loading…</p>;
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-lg)">
        <DialogHeader>
          <DialogTitle>{party ? "Edit donor" : "Add donor"}</DialogTitle>
          <DialogDescription className="sr-only">
            {party ? "Edit donor details" : "Add a donor or sponsor"}
          </DialogDescription>
        </DialogHeader>
        {open ? body : null}
      </DialogContent>
    </Dialog>
  );
}
