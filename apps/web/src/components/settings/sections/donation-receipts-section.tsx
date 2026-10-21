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
} from "@pi-dash/shared/receipts";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
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

type ReceiptDetails = Omit<ReceiptSettings, "signatureKey">;

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

/**
 * The signatory's signature: the stored one, or a newly chosen image already
 * turned into the PNG receipts print, shown on white as on the receipt.
 */
function SignatureInput({
  error,
  hasStored,
  onChange,
  value,
}: {
  error: string | null;
  hasStored: boolean;
  onChange: (png: Blob) => void;
  value: Blob | null;
}) {
  const id = useId();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
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
    try {
      onChange(await receiptSignaturePng(file));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't read that image"
      );
    }
    setPreparing(false);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium" htmlFor={id}>
        Signatory's signature
      </label>
      <p className="text-muted-foreground text-sm" id={`${id}-description`}>
        A photo or scan of the signature in dark ink on white paper. The paper
        is removed; receipts print the ink above the signatory's name.
      </p>
      {shown ? (
        <img
          alt="Signatory's signature"
          className="h-20 w-60 rounded-md border bg-white object-contain p-2"
          height={80}
          src={shown}
          width={240}
        />
      ) : null}
      <input
        accept="image/png,image/jpeg"
        aria-describedby={`${id}-description`}
        aria-invalid={error ? true : undefined}
        className="file:bg-muted w-full min-w-0 text-sm file:mr-2 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
        disabled={preparing}
        id={id}
        onChange={choose}
        type="file"
      />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
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
  const [signature, setSignature] = useState<Blob | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      if (!(signature || hasStoredSignature)) {
        setSignatureError("Upload the signatory's signature");
        return;
      }
      await onSubmit(value, signature);
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
        <SignatureInput
          error={signatureError}
          hasStored={hasStoredSignature}
          onChange={(png) => {
            setSignature(png);
            setSignatureError(null);
          }}
          value={signature}
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
