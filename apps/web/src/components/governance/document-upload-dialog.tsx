import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  GOVERNANCE_DOCUMENT_FORMAT_LABELS,
  GOVERNANCE_DOCUMENT_KIND_LABELS,
  GOVERNANCE_DOCUMENT_MAX_BYTES,
  type GovernanceDocumentFormat,
  governanceDocumentFormatValues,
  type GovernanceDocumentKind,
  governanceDocumentKindValues,
} from "@pi-dash/shared/governance";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";

import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
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
import {
  createGovernanceDocument,
  getGovernanceUploadUrl,
} from "@/functions/governance";

import { dateToIso } from "./register-data";

const kindOptions = governanceDocumentKindValues.map((value) => ({
  label: GOVERNANCE_DOCUMENT_KIND_LABELS[value],
  value,
}));
const formatOptions = governanceDocumentFormatValues.map((value) => ({
  label: GOVERNANCE_DOCUMENT_FORMAT_LABELS[value],
  value,
}));

const ACCEPT: Record<GovernanceDocumentFormat, string> = {
  eml: ".eml,message/rfc822",
  pdf: ".pdf,application/pdf",
  scan: ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png",
  signed_pdf: ".pdf,application/pdf",
};

function guessFormat(file: File): GovernanceDocumentFormat {
  const name = file.name.toLowerCase();
  if (name.endsWith(".eml")) {
    return "eml";
  }
  if (name.endsWith(".pdf")) {
    return "pdf";
  }
  return "scan";
}

interface Values {
  datedOn: Date | undefined;
  kind: GovernanceDocumentKind;
  note: string;
  sourceFormat: GovernanceDocumentFormat;
  title: string;
}

function UploadForm({
  defaultKind,
  onDone,
  onUploaded,
}: {
  defaultKind: GovernanceDocumentKind;
  onDone: () => void;
  onUploaded: (id: string) => void;
}) {
  const presign = useServerFn(getGovernanceUploadUrl);
  const create = useServerFn(createGovernanceDocument);
  const [file, setFile] = useState<File | null>(null);
  const form = useForm({
    defaultValues: {
      datedOn: undefined,
      kind: defaultKind,
      note: "",
      sourceFormat: "pdf",
      title: "",
    } as Values,
    onSubmit: async ({ value }) => {
      const datedOn = dateToIso(value.datedOn);
      if (!file) {
        toast.error("Choose a file.");
        return;
      }
      if (!(datedOn && value.title.trim())) {
        toast.error("Give the document a title and its date.");
        return;
      }
      if (file.size > GOVERNANCE_DOCUMENT_MAX_BYTES) {
        toast.error("The file is larger than 25 MB.");
        return;
      }
      try {
        const mimeType = file.type || "application/octet-stream";
        const { key, presignedUrl } = await presign({
          data: { fileName: file.name, fileSize: file.size, mimeType },
        });
        const put = await fetch(presignedUrl, {
          body: file,
          headers: { "Content-Type": mimeType },
          method: "PUT",
        });
        if (!put.ok) {
          throw new Error("The upload didn't go through. Try again.");
        }
        const result = await create({
          data: {
            datedOn,
            fileName: file.name,
            kind: value.kind,
            note: value.note,
            sourceFormat: value.sourceFormat,
            tempKey: key,
            title: value.title,
          },
        });
        const signed = result.report?.signatures.length ?? 0;
        toast.success("Added to the vault", {
          description:
            signed > 0
              ? `${signed === 1 ? "1 signature" : `${signed} signatures`} checked: ${result.report?.status === "valid" ? "valid" : (result.report?.status ?? "")}.`
              : undefined,
        });
        onUploaded(result.id);
        onDone();
      } catch (error) {
        log.error({
          action: "governanceDocument.create",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "DocumentUploadDialog",
        });
        toast.error("Couldn't add the document", {
          description:
            error instanceof Error ? error.message : "Something went wrong",
        });
      }
    },
  });
  const handleFile = useEventCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.files?.[0] ?? null;
      setFile(next);
      if (next) {
        form.setFieldValue("sourceFormat", guessFormat(next));
        if (!form.getFieldValue("title")) {
          form.setFieldValue("title", next.name.replace(/\.[^.]+$/, ""));
        }
      }
    }
  );
  const cancel = useEventCallback(onDone);

  return (
    <FormLayout form={form}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="governance-document-file">File</Label>
        <form.Subscribe selector={(s) => s.values.sourceFormat}>
          {(sourceFormat) => (
            <Input
              accept={ACCEPT[sourceFormat]}
              id="governance-document-file"
              onChange={handleFile}
              type="file"
            />
          )}
        </form.Subscribe>
        <p className="text-muted-foreground text-xs">
          PDF, digitally signed PDF, email (.eml with full headers) or a scan.
          Up to 25 MB. The file can't be changed once it's in the vault.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField isRequired label="Title" name="title" />
        <SelectField
          isRequired
          label="Kind"
          name="kind"
          options={kindOptions}
        />
        <DateField
          description="The date on the document: signed, sent or registered."
          isRequired
          label="Dated"
          name="datedOn"
        />
        <SelectField
          description="Signed PDFs have their signatures checked and matched to the register."
          isRequired
          label="Format"
          name="sourceFormat"
          options={formatOptions}
        />
      </div>
      <TextareaField
        description="What it proves and its limits."
        label="Note"
        name="note"
        rows={2}
      />
      <FormActions
        disableWhenInvalid={false}
        onCancel={cancel}
        submitLabel="Add to vault"
        submittingLabel="Uploading..."
      />
    </FormLayout>
  );
}

export function DocumentUploadDialog({
  defaultKind = "evidence",
  onOpenChange,
  onUploaded,
  open,
}: {
  defaultKind?: GovernanceDocumentKind;
  onOpenChange: (open: boolean) => void;
  onUploaded: (id: string) => void;
  open: boolean;
}) {
  const close = useEventCallback(() => onOpenChange(false));
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-lg)">
        <DialogHeader>
          <DialogTitle>Add a document</DialogTitle>
          <DialogDescription>
            Deeds, certificates, resolutions, resignations and other evidence
            for the register.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <UploadForm
            defaultKind={defaultKind}
            onDone={close}
            onUploaded={onUploaded}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
