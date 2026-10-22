import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type GrantDonationType,
  grantDonationTypeValues,
  type GrantStatus,
  PROGRAMME_IDS,
} from "@pi-dash/shared/constants";
import { DONATION_TYPE_LABELS, GIVER_ROLES } from "@pi-dash/shared/income";
import { rupeesToPaise } from "@pi-dash/shared/money";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { GrantAgreement } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { CheckboxField } from "@/components/form/checkbox-field";
import { ComboboxField } from "@/components/form/combobox-field";
import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import { TextareaField } from "@/components/form/textarea-field";
import { withCurrentOption } from "@/components/income/picker-options";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { positiveRupeesSchema } from "@/lib/form-schemas";
import { epochToLocalDate, localDateToIso } from "@/lib/local-date";
import { handleMutationResult } from "@/lib/mutation-result";
import { paiseToRupeesInput } from "@/lib/paise";

import { GRANT_LAST_MONTH } from "./grant-dates";

const text = (max: number) => z.string().trim().max(max);
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
    agreementOn: z.date().optional(),
    agreementReference: text(120),
    donationType: z.enum(grantDonationTypeValues),
    endsOn: requiredDate("Pick the end date"),
    needsCaCertificate: z.boolean(),
    notes: text(1000),
    partyId: pick("Pick the grantor"),
    programmeId: pick("Pick a programme"),
    projectId: pick("Pick the project the grant funds"),
    sanctioned: positiveRupeesSchema,
    scheduleViiItem: text(200),
    startsOn: requiredDate("Pick the start date"),
    title: text(200).min(1, "Name the grant"),
  })
  .refine((v) => !(v.startsOn && v.endsOn) || v.endsOn >= v.startsOn, {
    message: "The grant can't end before it starts",
    path: ["endsOn"],
  });

type FormValues = z.input<typeof formSchema>;

/** The grant as the form edits it, with the names of what it points at. */
export type EditableGrant = GrantAgreement & {
  party?: { displayName: string } | null;
  programme?: { name: string } | null;
  project?: { name: string } | null;
};

function valuesFor(grant: EditableGrant | null): FormValues {
  return {
    agreementOn: epochToLocalDate(grant?.agreementOn),
    agreementReference: grant?.agreementReference ?? "",
    donationType: (grant?.donationType ?? "csr") as GrantDonationType,
    endsOn: epochToLocalDate(grant?.endsOn),
    needsCaCertificate: grant?.needsCaCertificate ?? false,
    notes: grant?.notes ?? "",
    partyId: grant?.partyId,
    programmeId: grant?.programmeId,
    projectId: grant?.projectId,
    sanctioned: paiseToRupeesInput(grant?.sanctionedPaise),
    scheduleViiItem: grant?.scheduleViiItem ?? "",
    startsOn: epochToLocalDate(grant?.startsOn),
    title: grant?.title ?? "",
  };
}

function GrantForm({
  grant,
  onOpenChange,
}: {
  grant: EditableGrant | null;
  onOpenChange: (open: boolean) => void;
}) {
  const zero = useZero();
  const navigate = useNavigate();
  // Fixed for the life of the form so a retried save cannot duplicate.
  const [id] = useState(() => grant?.id ?? uuidv7());
  const [parties] = useQuery(queries.party.all());
  const [programmes] = useQuery(queries.programme.active());
  const [projects] = useQuery(queries.project.all());

  const grantorOptions = withCurrentOption(
    parties
      .filter((p) =>
        p.roles.some(
          (r) => r.active && (GIVER_ROLES as readonly string[]).includes(r.role)
        )
      )
      .map((p) => ({ label: p.displayName, value: p.id })),
    grant?.partyId,
    grant?.party?.displayName
  );
  const programmeOptions = withCurrentOption(
    programmes
      .filter((p) => p.id !== PROGRAMME_IDS.unallocated)
      .map((p) => ({ label: p.name, value: p.id })),
    grant?.programmeId,
    grant?.programme?.name
  );

  const form = useForm({
    defaultValues: valuesFor(grant),
    listeners: {
      onChange: ({ fieldApi, formApi }) => {
        // A project of another programme no longer fits.
        if (fieldApi.name === "programmeId") {
          const project = projects.find(
            (p) => p.id === formApi.getFieldValue("projectId")
          );
          if (
            project &&
            project.programmeId !== formApi.getFieldValue("programmeId")
          ) {
            formApi.setFieldValue("projectId", undefined);
          }
        }
      },
    },
    onSubmit: async ({ value }) => {
      const res = await zero.mutate(
        mutators.grant.save({
          agreementOn: localDateToIso(value.agreementOn),
          agreementReference: value.agreementReference || null,
          donationType: value.donationType,
          endsOn: localDateToIso(value.endsOn) ?? "",
          id,
          needsCaCertificate: value.needsCaCertificate,
          notes: value.notes || null,
          partyId: value.partyId ?? "",
          programmeId: value.programmeId ?? "",
          projectId: value.projectId ?? "",
          sanctionedPaise: rupeesToPaise(value.sanctioned.trim()),
          scheduleViiItem: value.scheduleViiItem || null,
          startsOn: localDateToIso(value.startsOn) ?? "",
          status: (grant?.status ?? "active") as GrantStatus,
          title: value.title.trim(),
        })
      ).server;
      handleMutationResult(res, {
        entityId: id,
        errorMsg: "Couldn't save the grant",
        mutation: "grant.save",
        successMsg: grant ? "Grant updated" : "Grant added",
      });
      if (res.type === "error") {
        return;
      }
      onOpenChange(false);
      if (!grant) {
        navigate({ params: { id }, to: "/finance/grants/$id" });
      }
    },
    validators: { onChange: formSchema, onSubmit: formSchema },
  });
  const cancel = useEventCallback(() => onOpenChange(false));

  return (
    <FormLayout form={form}>
      <InputField isRequired label="Title" name="title" />
      <ComboboxField
        emptyMessage="No grantors match. Add them under Donors first."
        isRequired
        label="Grantor"
        name="partyId"
        options={grantorOptions}
        placeholder="Search donors, sponsors and grantors..."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          isRequired
          label="Donation type"
          name="donationType"
          options={grantDonationTypeValues.map((value) => ({
            label: DONATION_TYPE_LABELS[value],
            value,
          }))}
        />
        <InputField
          inputMode="decimal"
          isRequired
          label="Sanctioned (₹)"
          name="sanctioned"
        />
        <SelectField
          isRequired
          label="Programme"
          name="programmeId"
          options={programmeOptions}
          placeholder="Pick a programme"
        />
        <form.Subscribe selector={(state) => state.values.programmeId}>
          {(programmeId) => (
            <SelectField
              description="A project's grants can't overlap in time."
              disabled={!programmeId}
              isRequired
              label="Project"
              name="projectId"
              options={withCurrentOption(
                projects
                  .filter(
                    (p) =>
                      p.programmeId === programmeId && p.status !== "closed"
                  )
                  .map((p) => ({ label: p.name, value: p.id })),
                grant?.projectId,
                grant?.project?.name
              )}
              placeholder="Pick a project"
            />
          )}
        </form.Subscribe>
        <DateField
          endMonth={GRANT_LAST_MONTH}
          isRequired
          label="Starts on"
          name="startsOn"
        />
        <DateField
          endMonth={GRANT_LAST_MONTH}
          isRequired
          label="Ends on"
          name="endsOn"
        />
        <InputField label="Agreement reference" name="agreementReference" />
        <DateField label="Agreement date" name="agreementOn" />
      </div>
      <InputField
        description="As the agreement words it, for CSR grants."
        label="Schedule VII item"
        name="scheduleViiItem"
      />
      <CheckboxField
        description="Each utilisation certificate is final only once finance records the CA's certificate and UDIN."
        label="Agreement needs a CA certificate"
        name="needsCaCertificate"
      />
      <TextareaField label="Notes" name="notes" rows={2} />
      <FormActions
        onCancel={cancel}
        submitLabel={grant ? "Save changes" : "Add grant"}
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

/** New grant / Edit grant: the agreement's terms and the project it funds. */
export function GrantFormDialog({
  grant,
  onOpenChange,
  open,
}: {
  grant: EditableGrant | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-lg)">
        <DialogHeader>
          <DialogTitle>{grant ? "Edit grant" : "New grant"}</DialogTitle>
          <DialogDescription>
            A grant funds one project. Its spending is that project's expense in
            the books between the start and end dates.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <GrantForm
            grant={grant}
            key={grant?.id ?? "new"}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
