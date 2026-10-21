import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useState } from "react";
import z from "zod";

import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { uploadDonationCertificates } from "@/functions/donation-filings";
import {
  MAX_CERTIFICATE_UPLOAD_BYTES,
  UNMATCHED_REASON_LABELS,
} from "@/lib/donation-filings/certificate-terms";
import type { CertificateUploadResult } from "@/lib/donation-filings/server";
import { fileBase64 } from "@/lib/file-base64";

const uploadSchema = z.object({
  file: z
    .custom<File>((file) => file instanceof File, "Choose the ZIP or a PDF")
    .refine(
      (file) => file.size <= MAX_CERTIFICATE_UPLOAD_BYTES,
      "The file is larger than 20 MB; upload it in parts"
    ),
});

function UploadForm({
  filingId,
  onCancel,
  onUploaded,
}: {
  filingId: string;
  onCancel: () => void;
  onUploaded: (result: CertificateUploadResult) => void;
}) {
  const upload = useServerFn(uploadDonationCertificates);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { file: null as File | null },
    onSubmit: async ({ value }) => {
      if (!value.file) {
        return;
      }
      setError(null);
      try {
        onUploaded(
          await upload({
            data: {
              base64: await fileBase64(value.file),
              fileName: value.file.name,
              filingId,
            },
          })
        );
      } catch (caught) {
        log.error({
          action: "donationCertificates.upload",
          component: "UploadCertificatesDialog",
          error: "Certificate upload failed",
        });
        setError(
          caught instanceof Error
            ? caught.message
            : "The certificates couldn't be added."
        );
      }
    },
    validators: { onChange: uploadSchema, onSubmit: uploadSchema },
  });
  return (
    <FormLayout form={form}>
      <CustomField<File | null>
        description="The ZIP the portal downloads (Download 114 PDFs), or single PDFs. Up to 20 MB at a time."
        isRequired
        label="Certificates"
        name="file"
      >
        {(field) => (
          <Input
            accept=".zip,.pdf,application/zip,application/pdf"
            data-testid="certificate-file-input"
            id={field.name}
            onBlur={field.handleBlur}
            onChange={(event) =>
              field.handleChange(event.target.files?.[0] ?? null)
            }
            type="file"
          />
        )}
      </CustomField>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <FormActions
        onCancel={onCancel}
        submitLabel="Upload certificates"
        submittingLabel="Reading certificates..."
      />
    </FormLayout>
  );
}

function ResultList({
  items,
  title,
}: {
  items: { detail: string; key: string; name: string }[];
  title: string;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        {title} ({items.length})
      </h3>
      <ul className="divide-y rounded-lg border text-sm">
        {items.map((item) => (
          <li className="flex flex-col px-3 py-2" key={item.key}>
            <span className="truncate font-medium">{item.name}</span>
            <span className="text-muted-foreground text-xs">{item.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Uploads the portal's certificates against a filing and shows what matched.
 * Unmatched files are listed with the reason and not kept.
 */
export function UploadCertificatesDialog({
  filing,
  onOpenChange,
  onUploaded,
  rowNames,
}: {
  filing: { id: string; sequence: number } | null;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
  /** Row ID to "Sr. No. · donor", to name matched rows. */
  rowNames: ReadonlyMap<string, string>;
}) {
  const [result, setResult] = useState<CertificateUploadResult | null>(null);
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setResult(null);
    }
    onOpenChange(open);
  };
  const rowName = (rowId: string) => rowNames.get(rowId) ?? "A filing row";
  return (
    <Dialog onOpenChange={handleOpenChange} open={filing !== null}>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>
            Upload certificates for filing {filing?.sequence}
          </DialogTitle>
          <DialogDescription>
            Each PDF is matched to its row by Pre-ARN, else by the donor's ID
            number and amount. Nothing is emailed yet.
          </DialogDescription>
        </DialogHeader>
        {filing && !result ? (
          <UploadForm
            filingId={filing.id}
            key={filing.id}
            onCancel={() => handleOpenChange(false)}
            onUploaded={(uploaded) => {
              setResult(uploaded);
              onUploaded();
            }}
          />
        ) : null}
        {result ? (
          <>
            <div
              className="flex flex-col gap-4"
              data-testid="certificate-upload-result"
            >
              <ResultList
                items={result.matched.map((item) => ({
                  detail: `${rowName(item.rowId)} · ${item.matchedBy === "pre_arn" ? "by Pre-ARN" : "by ID number and amount"} · ${item.acknowledgementNumber}`,
                  key: item.fileName,
                  name: item.fileName,
                }))}
                title="Matched"
              />
              <ResultList
                items={result.unmatched.map((item) => ({
                  detail: UNMATCHED_REASON_LABELS[item.reason],
                  key: item.fileName,
                  name: item.fileName,
                }))}
                title="Not matched"
              />
              <ResultList
                items={result.alreadyStored.map((item) => ({
                  detail: rowName(item.rowId),
                  key: item.fileName,
                  name: item.fileName,
                }))}
                title="Already added"
              />
            </div>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)} type="button">
                Done
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
