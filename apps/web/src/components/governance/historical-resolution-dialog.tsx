import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  RESOLUTION_TEMPLATES,
  type ResolutionTemplateKey,
  resolutionTemplateKeyValues,
} from "@pi-dash/shared/resolutions";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
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
import { recordHistoricalResolutionFn } from "@/functions/resolutions";

import { documentOptions, fromDocumentOption, NO_DOCUMENT } from "./evidence";
import { dateToIso, useGovernanceDocuments } from "./register-data";

const templateOptions = resolutionTemplateKeyValues.map((key) => ({
  label: RESOLUTION_TEMPLATES[key].title,
  value: key,
}));

interface Values {
  decidedOn: Date | undefined;
  documentId: string;
  number: string;
  templateKey: ResolutionTemplateKey;
  title: string;
  validityNote: string;
}

function HistoricalForm({ onDone }: { onDone: () => void }) {
  const record = useServerFn(recordHistoricalResolutionFn);
  const { documents } = useGovernanceDocuments();
  const form = useForm({
    defaultValues: {
      decidedOn: undefined,
      documentId: NO_DOCUMENT,
      number: "",
      templateKey: "ordinary",
      title: "",
      validityNote: "",
    } as Values,
    onSubmit: async ({ value }) => {
      const decidedOn = dateToIso(value.decidedOn);
      if (!(decidedOn && value.number.trim() && value.title.trim())) {
        toast.error("Give the number, the title and the date it passed.");
        return;
      }
      try {
        await record({
          data: {
            decidedOn,
            documentId: fromDocumentOption(value.documentId),
            number: value.number,
            templateKey: value.templateKey,
            title: value.title,
            validityNote: value.validityNote,
          },
        });
        toast.success("Resolution recorded");
        onDone();
      } catch (error) {
        toast.error("Couldn't record it", {
          description:
            error instanceof Error ? error.message : "Something went wrong",
        });
      }
    },
  });
  const cancel = useEventCallback(onDone);
  return (
    <FormLayout form={form}>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          description="As on the paper, for example PI/TR/2026-27/001."
          isRequired
          label="Number"
          name="number"
        />
        <DateField isRequired label="Passed on" name="decidedOn" />
        <InputField isRequired label="Title" name="title" />
        <SelectField
          label="Kind"
          name="templateKey"
          options={templateOptions}
        />
      </div>
      <SelectField
        description="The signed copy in the vault."
        label="Document"
        name="documentId"
        options={documentOptions(
          documents.filter((d) => d.kind === "resolution")
        )}
      />
      <TextareaField
        description='Its standing, for example "signed in ink by 2 of 2 trustees".'
        label="Validity note"
        name="validityNote"
        rows={2}
      />
      <FormActions
        disableWhenInvalid={false}
        onCancel={cancel}
        submitLabel="Record resolution"
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

/**
 * A resolution passed on paper before the dashboard, recorded with its number so
 * the series continues from it. It changes nothing in the register.
 */
export function HistoricalResolutionDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const close = useEventCallback(() => onOpenChange(false));
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-lg)">
        <DialogHeader>
          <DialogTitle>Record a past resolution</DialogTitle>
          <DialogDescription>
            For resolutions passed on paper. The next circular takes the next
            number in its year. Record register changes on the trustee register.
          </DialogDescription>
        </DialogHeader>
        {open ? <HistoricalForm onDone={close} /> : null}
      </DialogContent>
    </Dialog>
  );
}
