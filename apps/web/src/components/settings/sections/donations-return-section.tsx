import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  DEFAULT_SECTION_CODE,
  parseReturnRegistration,
  RETURN_REGISTRATION_CONFIG_KEY,
  RETURN_REGISTRATION_MAX,
  serializeReturnRegistration,
} from "@pi-dash/shared/donations-return";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { format, parseISO } from "date-fns";
import { useState } from "react";
import z from "zod";

import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SettingsCard, SettingsRow } from "@/components/settings/settings-ui";
import { useApp } from "@/context/app-context";
import { DATE } from "@/lib/date-formats";
import { localDateToIso } from "@/lib/local-date";
import { handleMutationResult } from "@/lib/mutation-result";

const registrationSchema = z.object({
  sectionCode: z
    .string()
    .trim()
    .min(1, "Section code is required")
    .max(RETURN_REGISTRATION_MAX),
  urn: z.string().trim().min(1, "URN is required").max(RETURN_REGISTRATION_MAX),
  urnIssuedOn: z
    .date()
    .optional()
    .refine((value) => value !== undefined, "Pick the date of issue"),
});

type RegistrationValues = z.input<typeof registrationSchema>;

function RegistrationForm({
  initialValues,
  onCancel,
  onSubmit,
}: {
  initialValues: RegistrationValues;
  onCancel: () => void;
  onSubmit: (values: RegistrationValues) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
    validators: {
      onChange: registrationSchema,
      onSubmit: registrationSchema,
    },
  });
  return (
    <FormLayout form={form}>
      <div className="flex max-w-xl flex-col gap-3 py-2">
        <InputField
          description="The 80G registration number the trust's receipts carry."
          isRequired
          label="Unique Registration Number (URN)"
          name="urn"
        />
        <DateField
          isRequired
          label="Date of issue"
          maxDate={new Date()}
          name="urnIssuedOn"
        />
        <InputField
          description="As the portal's template lists it. The 2025 Act renumbers sections, so check it before each upload."
          isRequired
          label="Section code"
          name="sectionCode"
        />
        <FormActions
          onCancel={onCancel}
          submitLabel="Save registration"
          submittingLabel="Saving..."
        />
      </div>
    </FormLayout>
  );
}

/**
 * Settings → Organisation accounts → Donations return: the 80G details every
 * row of the upload file carries. Kept in app_config (not secret);
 * finance.view sees them, finance.manage edits them.
 */
export function DonationsReturnSection() {
  const zero = useZero();
  const { hasPermission } = useApp();
  const canManage = hasPermission("finance.manage");
  const [configs] = useQuery(queries.appConfig.all());
  const stored = parseReturnRegistration(
    configs?.find((c) => c.key === RETURN_REGISTRATION_CONFIG_KEY)?.value
  );
  const [editing, setEditing] = useState(false);
  const openEdit = useEventCallback(() => setEditing(true));
  const cancel = useEventCallback(() => setEditing(false));

  const handleSubmit = useEventCallback(async (values: RegistrationValues) => {
    const res = await zero.mutate(
      mutators.appConfig.upsert({
        key: RETURN_REGISTRATION_CONFIG_KEY,
        value: serializeReturnRegistration({
          sectionCode: values.sectionCode,
          urn: values.urn,
          urnIssuedOn: localDateToIso(values.urnIssuedOn) ?? "",
        }),
      })
    ).server;
    handleMutationResult(res, {
      entityId: RETURN_REGISTRATION_CONFIG_KEY,
      errorMsg: "Couldn't save the 80G registration",
      mutation: "appConfig.upsert",
      successMsg: "80G registration saved",
    });
    if (res.type !== "error") {
      setEditing(false);
    }
  });

  return (
    <SettingsCard
      description="Every row of the donations return (Form 113) carries the trust's 80G registration."
      title="Donations return"
    >
      {editing ? (
        <div className="bg-muted/30 px-4 py-3">
          <RegistrationForm
            initialValues={{
              sectionCode: stored?.sectionCode ?? DEFAULT_SECTION_CODE,
              urn: stored?.urn ?? "",
              urnIssuedOn: stored ? parseISO(stored.urnIssuedOn) : undefined,
            }}
            onCancel={cancel}
            onSubmit={handleSubmit}
          />
        </div>
      ) : (
        <SettingsRow
          description={
            stored
              ? `Issued ${format(parseISO(stored.urnIssuedOn), DATE)} · ${stored.sectionCode}`
              : "Not set yet. The upload file can't be exported without it."
          }
          title={stored ? `URN ${stored.urn}` : "80G registration"}
        >
          {canManage ? (
            <Button
              aria-label="Edit 80G registration"
              onClick={openEdit}
              size="sm"
              type="button"
              variant="outline"
            >
              {stored ? "Edit" : "Add"}
            </Button>
          ) : null}
        </SettingsRow>
      )}
    </SettingsCard>
  );
}
