import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useState } from "react";
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
  type getTrusteeAccountOptions,
  saveTrusteeFn,
  type TrusteeDetailsResponse,
} from "@/functions/governance";
import { AADHAAR_PATTERN } from "@/lib/governance/schemas";

import type { RegisterTrustee } from "./register-data";

const NO_ACCOUNT = "none";
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const formSchema = z.object({
  aadhaarName: z.string().max(200),
  aadhaarReference: z
    .string()
    .refine(
      (v) => v.trim() === "" || AADHAAR_PATTERN.test(v.replace(/\s+/g, "")),
      "Enter the 12-digit Aadhaar number or the 16-digit Virtual ID"
    ),
  address: z.string().max(500),
  email: z.union([z.literal(""), z.email("Invalid email address")]),
  isCoFounder: z.boolean(),
  legalName: z.string().trim().min(1, "Name is required").max(200),
  pan: z
    .string()
    .refine(
      (v) => v.trim() === "" || PAN.test(v.replace(/\s+/g, "").toUpperCase()),
      "Enter a valid PAN, for example ABCDE1234F"
    ),
  panName: z.string().max(200),
  phone: z.string().max(30),
  userId: z.string(),
});
type FormValues = z.infer<typeof formSchema>;

type Account = Awaited<ReturnType<typeof getTrusteeAccountOptions>>[number];

export function TrusteeForm({
  accounts,
  context,
  onOpenChange,
  onSaved,
  trustee,
}: {
  accounts: Account[];
  context: TrusteeDetailsResponse;
  onOpenChange: (open: boolean) => void;
  onSaved: (trusteeId: string) => void;
  trustee: RegisterTrustee | null;
}) {
  const save = useServerFn(saveTrusteeFn);
  const isEdit = trustee !== null;
  const details = context.details;
  // Fixed for the life of the form so a retried create cannot duplicate.
  const [trusteeId] = useState(() => trustee?.id ?? uuidv7());

  const form = useForm({
    defaultValues: {
      aadhaarName: details?.aadhaarName ?? "",
      aadhaarReference: "",
      address: details?.address ?? "",
      email: details?.email ?? "",
      isCoFounder: trustee?.isCoFounder ?? false,
      legalName: trustee?.legalName ?? "",
      pan: "",
      panName: details?.panName ?? "",
      phone: details?.phone ?? "",
      userId: trustee?.userId ?? NO_ACCOUNT,
    } satisfies FormValues as FormValues,
    onSubmit: async ({ value }) => {
      await save({
        data: {
          aadhaarName: value.aadhaarName,
          // Blank keeps what is stored.
          aadhaarReference:
            value.aadhaarReference.trim() === ""
              ? undefined
              : value.aadhaarReference,
          address: value.address,
          email: value.email,
          id: trusteeId,
          isCoFounder: value.isCoFounder,
          legalName: value.legalName,
          mode: isEdit ? "update" : "create",
          pan: value.pan.trim() === "" ? undefined : value.pan,
          panName: value.panName,
          phone: value.phone,
          userId: value.userId === NO_ACCOUNT ? null : value.userId,
        },
      })
        .then(() => {
          toast.success(isEdit ? "Trustee updated" : "Trustee added");
          onSaved(trusteeId);
          onOpenChange(false);
        })
        .catch((error: unknown) => {
          log.error({
            action: isEdit ? "trustee.update" : "trustee.create",
            caughtError: error instanceof Error ? error.message : String(error),
            component: "TrusteeFormDialog",
          });
          toast.error(
            isEdit ? "Couldn't update trustee" : "Couldn't add trustee",
            {
              description:
                error instanceof Error ? error.message : "Something went wrong",
            }
          );
        });
    },
    validators: { onChange: formSchema, onSubmit: formSchema },
  });
  const cancel = useEventCallback(() => onOpenChange(false));

  const accountOptions = [
    { label: "No dashboard account", value: NO_ACCOUNT },
    ...accounts.map((a) => ({
      label: a.email ? `${a.name} · ${a.email}` : a.name,
      value: a.id,
    })),
  ];
  const kycHint = (stored: boolean, last4: string | null) => {
    if (!context.identifiersAvailable) {
      return "Can't be stored until the encryption key is configured.";
    }
    if (stored) {
      return `Stored${last4 ? `, ending ${last4}` : ""}. Leave blank to keep it.`;
    }
    return "Stored encrypted; only people allowed to see trustee KYC can reveal it.";
  };

  return (
    <FormLayout form={form}>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          description="As in the deed or the resolution that appointed them."
          isRequired
          label="Legal name"
          name="legalName"
        />
        <SelectField
          description="The account that votes and signs as this trustee."
          label="Dashboard account"
          name="userId"
          options={accountOptions}
        />
      </div>
      <CheckboxField
        description="Named as a Co-Founder in the deed (clauses 4.4 and 4.7)."
        label="Co-Founder"
        name="isCoFounder"
      />

      <FormSectionHeading>Contact</FormSectionHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField label="Email" name="email" type="email" />
        <InputField label="Phone" name="phone" />
      </div>
      <TextareaField label="Address" name="address" rows={2} />

      <FormSectionHeading>KYC</FormSectionHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          description="As printed on the PAN card; DSC certificates carry this name."
          label="Name on PAN"
          name="panName"
        />
        <InputField
          description={kycHint(!!details?.hasPan, details?.panLast4 ?? null)}
          disabled={!context.identifiersAvailable}
          label="PAN"
          name="pan"
        />
        <InputField
          description="As printed on the Aadhaar card."
          label="Name on Aadhaar"
          name="aadhaarName"
        />
        <InputField
          description={kycHint(
            !!details?.hasAadhaarReference,
            details?.aadhaarLast4 ?? null
          )}
          disabled={!context.identifiersAvailable}
          label="Aadhaar number or Virtual ID"
          name="aadhaarReference"
        />
      </div>

      <FormActions
        disableWhenInvalid={false}
        onCancel={cancel}
        submitLabel={isEdit ? "Save changes" : "Add trustee"}
        submittingLabel={isEdit ? "Saving..." : "Adding..."}
      />
    </FormLayout>
  );
}
