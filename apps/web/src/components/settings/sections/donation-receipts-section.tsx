import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  isValidOrgPan,
  parseReceiptSettings,
  RECEIPT_ISSUER_LABELS,
  RECEIPT_ISSUER_POLICY,
  RECEIPT_SETTINGS_ADDRESS_MAX,
  RECEIPT_SETTINGS_CONFIG_KEY,
  RECEIPT_SETTINGS_TEXT_MAX,
  RECEIPTING_START_LABEL,
  type ReceiptSettings,
  serializeReceiptSettings,
} from "@pi-dash/shared/receipts";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { TextareaField } from "@/components/form/textarea-field";
import {
  SettingsCard,
  SettingsListItem,
  SettingsRow,
} from "@/components/settings/settings-ui";
import { useApp } from "@/context/app-context";
import { handleMutationResult } from "@/lib/mutation-result";

const text = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max);

const detailsSchema = z.object({
  orgAddress: text("Address", RECEIPT_SETTINGS_ADDRESS_MAX),
  orgName: text("Name", RECEIPT_SETTINGS_TEXT_MAX),
  orgPan: z
    .string()
    .trim()
    .refine(isValidOrgPan, "Enter the trust's 10-character PAN"),
  signatoryDesignation: text("Designation", RECEIPT_SETTINGS_TEXT_MAX),
  signatoryName: text("Signatory", RECEIPT_SETTINGS_TEXT_MAX),
});

function DetailsForm({
  initialValues,
  onCancel,
  onSubmit,
}: {
  initialValues: ReceiptSettings;
  onCancel: () => void;
  onSubmit: (values: ReceiptSettings) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
    validators: { onChange: detailsSchema, onSubmit: detailsSchema },
  });
  return (
    <FormLayout form={form}>
      <div className="flex max-w-xl flex-col gap-3 py-2">
        <InputField
          description="As registered, printed at the top of every receipt."
          isRequired
          label="Trust name"
          name="orgName"
        />
        <TextareaField
          isRequired
          label="Registered address"
          name="orgAddress"
        />
        <InputField isRequired label="Trust PAN" name="orgPan" />
        <InputField
          description="Who signs the receipts. Printed in the signatory block."
          isRequired
          label="Signatory name"
          name="signatoryName"
        />
        <InputField
          isRequired
          label="Signatory designation"
          name="signatoryDesignation"
        />
        <FormActions
          onCancel={onCancel}
          submitLabel="Save receipt details"
          submittingLabel="Saving..."
        />
      </div>
    </FormLayout>
  );
}

/**
 * Settings → Organisation accounts → Donation receipts: who receipts which
 * gifts (fixed policy, read-only), the receipting start date, and the
 * trust's particulars every pi-dash receipt prints. Kept in app_config;
 * finance.view sees them, finance.manage edits them. Issued receipts keep
 * the particulars they were issued with.
 */
export function DonationReceiptsSection() {
  const zero = useZero();
  const { hasPermission } = useApp();
  const canManage = hasPermission("finance.manage");
  const [configs] = useQuery(queries.appConfig.all());
  const stored = parseReceiptSettings(
    configs?.find((c) => c.key === RECEIPT_SETTINGS_CONFIG_KEY)?.value
  );
  const [editing, setEditing] = useState(false);
  const openEdit = useEventCallback(() => setEditing(true));
  const cancel = useEventCallback(() => setEditing(false));

  const handleSubmit = useEventCallback(async (values: ReceiptSettings) => {
    const res = await zero.mutate(
      mutators.appConfig.upsert({
        key: RECEIPT_SETTINGS_CONFIG_KEY,
        value: serializeReceiptSettings(values),
      })
    ).server;
    handleMutationResult(res, {
      entityId: RECEIPT_SETTINGS_CONFIG_KEY,
      errorMsg: "Couldn't save the receipt details",
      mutation: "appConfig.upsert",
      successMsg: "Receipt details saved",
    });
    if (res.type !== "error") {
      setEditing(false);
    }
  });

  return (
    <SettingsCard
      description={`Proud Indian receipts direct gifts received from ${RECEIPTING_START_LABEL}. Gateways receipt their own; this is fixed.`}
      title="Donation receipts"
    >
      {RECEIPT_ISSUER_POLICY.map((policy) => (
        <SettingsListItem
          actions={
            <span className="text-muted-foreground text-sm">
              {RECEIPT_ISSUER_LABELS[policy.issuer]}
            </span>
          }
          // The note is the point of the row, so it wraps instead of
          // truncating.
          detail={<span className="whitespace-normal">{policy.note}</span>}
          key={policy.issuer}
        >
          {policy.channels}
        </SettingsListItem>
      ))}
      {editing ? (
        <div className="bg-muted/30 px-4 py-3">
          <DetailsForm
            initialValues={
              stored ?? {
                orgAddress: "",
                orgName: "",
                orgPan: "",
                signatoryDesignation: "",
                signatoryName: "",
              }
            }
            onCancel={cancel}
            onSubmit={handleSubmit}
          />
        </div>
      ) : (
        <SettingsRow
          description={
            stored
              ? `PAN ${stored.orgPan} · signed by ${stored.signatoryName}, ${stored.signatoryDesignation}`
              : "Not set yet. Receipts can't be issued without them."
          }
          title={stored ? stored.orgName : "Receipt details"}
        >
          {canManage ? (
            <Button
              aria-label="Edit receipt details"
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
