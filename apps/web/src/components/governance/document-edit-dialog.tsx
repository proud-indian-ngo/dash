import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  GOVERNANCE_DOCUMENT_KIND_LABELS,
  type GovernanceDocumentKind,
  governanceDocumentKindValues,
} from "@pi-dash/shared/governance";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
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
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";

import type { VaultDocument } from "./document-detail-sheet";
import { dateToIso, isoToDate } from "./register-data";

// A utilisation certificate's kind is fixed: nothing becomes one by hand.
const kindOptions = governanceDocumentKindValues
  .filter((value) => value !== "utilisation_certificate")
  .map((value) => ({
    label: GOVERNANCE_DOCUMENT_KIND_LABELS[value],
    value,
  }));
const certificateKind = [
  {
    label: GOVERNANCE_DOCUMENT_KIND_LABELS.utilisation_certificate,
    value: "utilisation_certificate",
  },
];

interface Values {
  datedOn: Date | undefined;
  kind: GovernanceDocumentKind;
  note: string;
  title: string;
}

function EditForm({
  document,
  onDone,
}: {
  document: VaultDocument;
  onDone: () => void;
}) {
  const zero = useZero();
  const form = useForm({
    defaultValues: {
      datedOn: isoToDate(document.datedOn),
      kind: document.kind,
      note: document.note ?? "",
      title: document.title,
    } as Values,
    onSubmit: async ({ value }) => {
      const datedOn = dateToIso(value.datedOn);
      if (!(datedOn && value.title.trim())) {
        toast.error("Give the document a title and its date.");
        return;
      }
      const result = await zero.mutate(
        mutators.governanceDocument.update({
          datedOn,
          id: document.id,
          kind: value.kind,
          note: value.note.trim() || null,
          title: value.title,
        })
      ).server;
      handleMutationResult(result, {
        entityId: document.id,
        errorMsg: `Couldn't save: ${getMutationResultErrorMessage(result.type === "error" ? result.error : undefined, "something went wrong")}`,
        mutation: "governanceDocument.update",
        successMsg: "Details saved",
      });
      if (result.type !== "error") {
        onDone();
      }
    },
  });
  const cancel = useEventCallback(onDone);

  return (
    <FormLayout form={form}>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField isRequired label="Title" name="title" />
        {document.kind === "utilisation_certificate" ? (
          <SelectField
            disabled
            label="Kind"
            name="kind"
            options={certificateKind}
          />
        ) : (
          <SelectField
            isRequired
            label="Kind"
            name="kind"
            options={kindOptions}
          />
        )}
        <DateField
          description="The date on the document: signed, sent or registered."
          isRequired
          label="Dated"
          name="datedOn"
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
        submitLabel="Save"
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

/** Title, kind, date and note; the file itself never changes. */
export function DocumentEditDialog({
  document,
  onOpenChange,
  open,
}: {
  document: VaultDocument;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const close = useEventCallback(() => onOpenChange(false));
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-lg)">
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
          <DialogDescription>
            The file stays as it was added. To replace it, add the new file and
            delete this one.
          </DialogDescription>
        </DialogHeader>
        {open ? <EditForm document={document} onDone={close} /> : null}
      </DialogContent>
    </Dialog>
  );
}
