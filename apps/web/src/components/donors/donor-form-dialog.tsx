import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type ForeignSourceAssessment,
  foreignSourceAssessmentValues,
  type PartyIdType,
  partyIdTypeValues,
  type PartyKind,
  partyKindValues,
  type PartyRole,
} from "@pi-dash/shared/constants";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { CheckboxField } from "@/components/form/checkbox-field";
import { FormActions } from "@/components/form/form-actions";
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
import { getPartyDetails, savePartyDetails } from "@/functions/parties";
import { getMutationResultErrorMessage } from "@/lib/mutation-result";

import {
  DIRECTORY_ROLES,
  type DirectoryRole,
  type PartyRow,
  ROLE_LABELS,
} from "./party-row";

const ID_TYPE_LABELS: Record<PartyIdType, string> = {
  driving_licence: "Driving licence",
  none: "None",
  pan: "PAN",
  passport: "Passport",
  ration_card: "Ration card",
  tax_id_foreign: "Foreign tax ID",
  voter_id: "Voter ID",
};

const ASSESSMENT_LABELS: Record<ForeignSourceAssessment, string> = {
  domestic: "Domestic",
  foreign: "Foreign source",
  pending: "Not assessed yet",
};

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

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const donorSchema = z
  .object({
    addressLine1: z.string().trim().max(200),
    addressLine2: z.string().trim().max(200),
    assessmentNote: z.string().trim().max(500),
    city: z.string().trim().max(80),
    country: z.string().trim().length(2, "Two-letter country code"),
    displayName: z.string().trim().min(1, "Name is required").max(160),
    email: z.union([z.literal(""), z.email("Invalid email address")]),
    foreignSourceAssessment: z.enum(foreignSourceAssessmentValues),
    idNumber: z.string().trim().max(40),
    idType: z.enum(partyIdTypeValues),
    kind: z.enum(partyKindValues),
    legalName: z.string().trim().max(200),
    nationality: z.string().trim().max(60),
    phone: z.string().trim().max(32),
    pincode: z.string().trim().max(12),
    roleDonor: z.boolean(),
    roleGrantor: z.boolean(),
    roleIntermediary: z.boolean(),
    roleSponsor: z.boolean(),
    state: z.string().trim().max(80),
  })
  .refine(
    (v) => v.idType !== "pan" || v.idNumber === "" || PAN_RE.test(v.idNumber),
    { message: "Invalid PAN (e.g. ABCDE1234F)", path: ["idNumber"] }
  )
  .refine(
    (v) => v.roleDonor || v.roleSponsor || v.roleGrantor || v.roleIntermediary,
    { message: "Pick at least one role", path: ["roleDonor"] }
  );

type DonorFormValues = z.infer<typeof donorSchema>;

const ROLE_FIELDS: Record<DirectoryRole, keyof DonorFormValues> = {
  donor: "roleDonor",
  grantor: "roleGrantor",
  intermediary: "roleIntermediary",
  sponsor: "roleSponsor",
};

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
    roleDonor: true,
    roleGrantor: false,
    roleIntermediary: false,
    roleSponsor: false,
    state: "",
  };
}

type Details = Awaited<ReturnType<typeof getPartyDetails>>;

function valuesFor(party: PartyRow, details: Details): DonorFormValues {
  const active = new Set(
    party.roles.filter((r) => r.active).map((r) => r.role as PartyRole)
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
    idNumber: "",
    idType: details?.idType ?? "none",
    kind: party.kind as PartyKind,
    legalName: party.legalName ?? "",
    nationality: details?.nationality ?? "",
    phone: details?.phone ?? "",
    pincode: details?.pincode ?? "",
    roleDonor: active.has("donor"),
    roleGrantor: active.has("grantor"),
    roleIntermediary: active.has("intermediary"),
    roleSponsor: active.has("sponsor"),
    state: details?.state ?? "",
  };
}

function DonorForm({
  details,
  onOpenChange,
  party,
}: {
  details: Details;
  onOpenChange: (open: boolean) => void;
  party: PartyRow | null;
}) {
  const zero = useZero();
  const saveDetails = useServerFn(savePartyDetails);
  const isEdit = party !== null;

  const form = useForm({
    defaultValues: party ? valuesFor(party, details) : emptyValues(),
    onSubmit: async ({ value }) => {
      const id = party?.id ?? uuidv7();
      const wanted = DIRECTORY_ROLES.filter(
        (role) => value[ROLE_FIELDS[role]] === true
      );
      const identity = isEdit
        ? zero.mutate(
            mutators.party.update({
              displayName: value.displayName,
              id,
              kind: value.kind,
              legalName: value.legalName || null,
            })
          )
        : zero.mutate(
            mutators.party.create({
              displayName: value.displayName,
              id,
              kind: value.kind,
              legalName: value.legalName || null,
              roleIds: wanted.map(() => uuidv7()),
              roles: wanted,
            })
          );
      const res = await identity.server;
      if (res.type === "error") {
        toast.error(
          isEdit ? "Couldn't update donor" : "Couldn't create donor",
          {
            description: getMutationResultErrorMessage(res.error, ""),
          }
        );
        return;
      }
      if (isEdit && party) {
        for (const role of DIRECTORY_ROLES) {
          const had = party.roles.some((r) => r.role === role && r.active);
          const want = wanted.includes(role);
          if (had !== want) {
            await zero.mutate(
              mutators.party.setRole({
                active: want,
                id: uuidv7(),
                partyId: id,
                role,
              })
            ).server;
          }
        }
      }
      try {
        await saveDetails({
          data: {
            addressLine1: value.addressLine1,
            addressLine2: value.addressLine2,
            assessmentNote: value.assessmentNote,
            city: value.city,
            country: value.country.toUpperCase(),
            email: value.email,
            foreignSourceAssessment: value.foreignSourceAssessment,
            // Blank keeps the stored identifier; "None" clears it server-side.
            idNumber: value.idNumber ? value.idNumber.toUpperCase() : undefined,
            idType: value.idType,
            nationality: value.nationality,
            partyId: id,
            phone: value.phone,
            pincode: value.pincode,
            state: value.state,
          },
        });
      } catch (error) {
        toast.error("Saved the donor but not their details", {
          description: error instanceof Error ? error.message : undefined,
        });
        return;
      }
      toast.success(isEdit ? "Donor updated" : "Donor created");
      onOpenChange(false);
    },
    validators: { onChange: donorSchema, onSubmit: donorSchema },
  });
  const cancel = useEventCallback(() => onOpenChange(false));
  const idHint =
    details?.idNumberLast4 && isEdit
      ? `Stored, ending ${details.idNumberLast4}. Leave blank to keep it.`
      : "Needed for the donation statement (Form 113) when the donor claims a deduction.";

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
            name={ROLE_FIELDS[role]}
          />
        ))}
      </div>

      <FormSectionHeading>Contact</FormSectionHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField label="Email" name="email" type="email" />
        <InputField label="Phone" name="phone" />
        <InputField label="Address line 1" name="addressLine1" />
        <InputField label="Address line 2" name="addressLine2" />
        <InputField label="City" name="city" />
        <InputField label="State" name="state" />
        <InputField label="PIN code" name="pincode" />
        <InputField label="Country" name="country" placeholder="IN" />
      </div>

      <FormSectionHeading>Identity and source</FormSectionHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="ID type" name="idType" options={idTypeOptions} />
        <InputField description={idHint} label="ID number" name="idNumber" />
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

export function DonorFormDialog({
  onOpenChange,
  open,
  party,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  party: PartyRow | null;
}) {
  const loadDetails = useServerFn(getPartyDetails);
  const [details, setDetails] = useState<Details | "loading">("loading");

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!party) {
      setDetails(null);
      return;
    }
    let cancelled = false;
    setDetails("loading");
    loadDetails({ data: { partyId: party.id } })
      .then((d) => {
        if (!cancelled) {
          setDetails(d);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetails(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, party, loadDetails]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-lg)">
        <DialogHeader>
          <DialogTitle>{party ? "Edit donor" : "Add donor"}</DialogTitle>
          <DialogDescription className="sr-only">
            {party ? "Edit donor details" : "Add a donor or sponsor"}
          </DialogDescription>
        </DialogHeader>
        {open && details !== "loading" ? (
          <DonorForm
            details={details}
            key={party?.id ?? "new"}
            onOpenChange={onOpenChange}
            party={party}
          />
        ) : (
          <p className="text-muted-foreground px-1 py-6 text-sm">Loading…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
