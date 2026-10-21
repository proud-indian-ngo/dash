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
  type ReceiptDetails,
} from "@pi-dash/shared/receipts";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import {
  type FormFieldApi,
  fieldErrorProps,
} from "@/components/form/form-context";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { TextareaField } from "@/components/form/textarea-field";
import {
  SettingsCard,
  SettingsListItem,
  SettingsRow,
} from "@/components/settings/settings-ui";
import { useApp } from "@/context/app-context";
import { getRequestUploadUrl } from "@/functions/attachments";
import { handleMutationResult } from "@/lib/mutation-result";
import { receiptSignaturePng } from "@/lib/receipt-signature-image";

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

/** Uploads the prepared PNG to a temporary key for the mutator to claim. */
async function uploadSignature(
  png: Blob,
  requestUploadUrl: (input: {
    data: { fileName: string; fileSize: number; mimeType: "image/png" };
  }) => Promise<{ key: string; presignedUrl: string }>
): Promise<string> {
  const { key, presignedUrl } = await requestUploadUrl({
    data: {
      fileName: "receipt-signature.png",
      fileSize: png.size,
      mimeType: "image/png",
    },
  });
  const uploaded = await fetch(presignedUrl, {
    body: png,
    headers: { "Content-Type": "image/png" },
    method: "PUT",
  });
  if (!uploaded.ok) {
    throw new Error(`Upload failed: ${uploaded.status}`);
  }
  return key;
}

const SIGNATURE_PREVIEW_URL = "/api/receipts/signature";
const SIGNATURE_REQUIRED = "Upload the signatory's signature";

/** The signature receipts print, on white as on the receipt. */
function SignaturePreview({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <p className="text-destructive text-sm">
        The stored signature couldn't be loaded. Upload it again.
      </p>
    );
  }
  return (
    <img
      alt="Signatory's signature"
      className="h-20 w-60 rounded-md border bg-white object-contain p-2"
      height={80}
      onError={() => setFailed(true)}
      src={src}
      width={240}
    />
  );
}

/**
 * Picks the signature: any photo or scan, turned into the PNG receipts
 * print before it is shown, so the preview is what will print.
 */
function SignaturePicker({
  field,
  hasStored,
  onPreparing,
  submitted,
}: {
  field: FormFieldApi<Blob | null>;
  hasStored: boolean;
  onPreparing: (preparing: boolean) => void;
  submitted: boolean;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const value = field.state.value;
  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);
  const shown = previewUrl ?? (hasStored ? SIGNATURE_PREVIEW_URL : null);
  const choose = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    setPreparing(true);
    onPreparing(true);
    try {
      field.handleChange(await receiptSignaturePng(file));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't read that image"
      );
    }
    setPreparing(false);
    onPreparing(false);
  };
  return (
    <div className="flex flex-col gap-2">
      {shown ? <SignaturePreview key={shown} src={shown} /> : null}
      <input
        {...fieldErrorProps(field, submitted)}
        accept="image/png,image/jpeg,image/webp"
        className="file:bg-muted w-full min-w-0 text-sm file:mr-2 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
        disabled={preparing}
        id={field.name}
        onChange={choose}
        type="file"
      />
      {preparing ? (
        <p className="text-muted-foreground text-sm" role="status">
          Preparing the signature...
        </p>
      ) : null}
    </div>
  );
}

function DetailsForm({
  hasStoredSignature,
  initialValues,
  onCancel,
  onSubmit,
}: {
  hasStoredSignature: boolean;
  initialValues: ReceiptDetails;
  onCancel: () => void;
  onSubmit: (values: ReceiptDetails, signature: Blob | null) => Promise<void>;
}) {
  const [preparing, setPreparing] = useState(false);
  const schema = detailsSchema
    .extend({ signature: z.instanceof(Blob).nullable() })
    .refine((values) => values.signature || hasStoredSignature, {
      message: SIGNATURE_REQUIRED,
      path: ["signature"],
    });
  const form = useForm({
    defaultValues: { ...initialValues, signature: null as Blob | null },
    onSubmit: async ({ value }) => {
      const { signature, ...details } = value;
      await onSubmit(details, signature);
    },
    validators: { onChange: schema, onSubmit: schema },
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
        <CustomField<Blob | null>
          description="A photo or scan of the signature in dark ink on white paper. The paper is removed; receipts print the ink above the signatory's name."
          isRequired
          label="Signatory's signature"
          name="signature"
        >
          {(field, submitted) => (
            <SignaturePicker
              field={field}
              hasStored={hasStoredSignature}
              onPreparing={setPreparing}
              submitted={submitted}
            />
          )}
        </CustomField>
        <FormActions
          disabled={preparing}
          onCancel={onCancel}
          submitLabel="Save receipt details"
          submittingLabel="Saving..."
        />
      </div>
    </FormLayout>
  );
}

/**
 * The stored details to start the form from, even when they are incomplete
 * (details saved before signatures were required have none).
 */
function receiptDetailsDraft(value: string | undefined): ReceiptDetails {
  let parsed: Partial<Record<keyof ReceiptDetails, unknown>> = {};
  try {
    parsed = value ? JSON.parse(value) : {};
  } catch {
    // Malformed: start empty.
  }
  const text = (key: keyof ReceiptDetails) =>
    typeof parsed[key] === "string" ? (parsed[key] as string) : "";
  return {
    orgAddress: text("orgAddress"),
    orgName: text("orgName"),
    orgPan: text("orgPan"),
    signatoryDesignation: text("signatoryDesignation"),
    signatoryName: text("signatoryName"),
  };
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
  const storedValue = configs?.find(
    (c) => c.key === RECEIPT_SETTINGS_CONFIG_KEY
  )?.value;
  const stored = parseReceiptSettings(storedValue);
  const [editing, setEditing] = useState(false);
  const openEdit = useEventCallback(() => setEditing(true));
  const cancel = useEventCallback(() => setEditing(false));
  const requestUploadUrl = useServerFn(getRequestUploadUrl);

  const handleSubmit = useEventCallback(
    async (values: ReceiptDetails, signature: Blob | null) => {
      let signatureUpload: string | null = null;
      if (signature) {
        try {
          signatureUpload = await uploadSignature(signature, requestUploadUrl);
        } catch (error) {
          log.error({
            action: "uploadReceiptSignature",
            component: "DonationReceiptsSection",
            error: error instanceof Error ? error.message : String(error),
          });
          toast.error("Couldn't upload the signature. Try again");
          return;
        }
      }
      const res = await zero.mutate(
        mutators.appConfig.saveReceiptSettings({ ...values, signatureUpload })
      ).server;
      handleMutationResult(res, {
        entityId: RECEIPT_SETTINGS_CONFIG_KEY,
        errorMsg: "Couldn't save the receipt details",
        mutation: "appConfig.saveReceiptSettings",
        successMsg: "Receipt details saved",
      });
      if (res.type !== "error") {
        setEditing(false);
      }
    }
  );

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
            hasStoredSignature={Boolean(stored)}
            initialValues={receiptDetailsDraft(storedValue)}
            onCancel={cancel}
            onSubmit={handleSubmit}
          />
        </div>
      ) : (
        <SettingsRow
          description={
            stored
              ? `PAN ${stored.orgPan} · signed by ${stored.signatoryName}, ${stored.signatoryDesignation}`
              : storedValue
                ? "Add the signatory's signature. Receipts can't be issued until then."
                : "Not set yet. Receipts can't be issued without them."
          }
          title={stored ? stored.orgName : "Receipt details"}
        >
          {canManage && stored ? (
            // Shown here too, so a replaced signature is seen without Edit.
            <img
              alt="Current signature"
              className="h-10 w-28 rounded border bg-white object-contain p-1"
              height={40}
              src={SIGNATURE_PREVIEW_URL}
              width={112}
            />
          ) : null}
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
