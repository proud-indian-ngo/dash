import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useForm } from "@tanstack/react-form";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { blankIdCardPagesSchema } from "@/lib/kalakriti-blank-id-cards";

interface BlankIdCardDownloadFormProps {
  onDownloaded: () => void;
  onDownloadingChange: (isDownloading: boolean) => void;
  onOpenChange: (open: boolean) => void;
  year: number;
}

function BlankIdCardDownloadForm({
  onDownloaded,
  onDownloadingChange,
  onOpenChange,
  year,
}: BlankIdCardDownloadFormProps) {
  const handleCancel = useEventCallback(() => onOpenChange(false));
  const form = useForm({
    defaultValues: {
      guestPages: 0,
      judgePages: 0,
      volunteerPages: 0,
    },
    onSubmit: async ({ value }) => {
      onDownloadingChange(true);
      try {
        const searchParams = new URLSearchParams({
          guestPages: String(value.guestPages),
          judgePages: String(value.judgePages),
          mode: "blank",
          volunteerPages: String(value.volunteerPages),
        });
        const response = await fetch(
          `/api/kalakriti/${year}/id-cards?${searchParams}`
        );
        if (!response.ok) {
          const body: unknown = await response.json();
          throw new Error(
            body &&
              typeof body === "object" &&
              "error" in body &&
              typeof body.error === "string"
              ? body.error
              : "Blank ID cards could not be downloaded"
          );
        }

        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = `kalakriti-${year}-blank-id-cards.pdf`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success("Blank ID cards downloaded");
        onDownloaded();
      } catch (error) {
        log.error({
          action: "downloadBlankIdCards",
          component: "BlankIdCardDownloadDialog",
          error: error instanceof Error ? error.message : String(error),
          guestPages: value.guestPages,
          judgePages: value.judgePages,
          volunteerPages: value.volunteerPages,
          year,
        });
        toast.error(
          error instanceof Error
            ? error.message
            : "Blank ID cards could not be downloaded"
        );
      } finally {
        onDownloadingChange(false);
      }
    },
    validators: {
      onChange: blankIdCardPagesSchema,
      onSubmit: blankIdCardPagesSchema,
    },
  });

  return (
    <FormLayout form={form} showSubmitError>
      <InputField
        autoFocus
        label="Volunteer pages"
        max={100}
        min={0}
        name="volunteerPages"
        step={1}
        type="number"
      />
      <InputField
        label="Guest pages"
        max={100}
        min={0}
        name="guestPages"
        step={1}
        type="number"
      />
      <InputField
        label="Judge pages"
        max={100}
        min={0}
        name="judgePages"
        step={1}
        type="number"
      />
      <FormActions
        onCancel={handleCancel}
        submitLabel="Download PDF"
        submittingLabel="Preparing ID cards..."
      />
    </FormLayout>
  );
}

export function BlankIdCardDownloadDialog({ year }: { year: number }) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const handleOpenChange = useEventCallback((nextOpen: boolean) => {
    if (isDownloading) {
      return;
    }
    if (nextOpen) {
      setFormKey((key) => key + 1);
    }
    setOpen(nextOpen);
  });
  const handleTrigger = useEventCallback(() => handleOpenChange(true));
  const handleDownloaded = useEventCallback(() => setOpen(false));

  return (
    <>
      <Button onClick={handleTrigger} type="button" variant="outline">
        Download blank ID cards
      </Button>
      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Blank ID cards</DialogTitle>
            <DialogDescription>
              Choose how many pages to generate for each card type. Each page
              contains four cards with a write-in name line and a unique QR
              code, with a maximum of 100 pages in total.
            </DialogDescription>
          </DialogHeader>
          <BlankIdCardDownloadForm
            key={formKey}
            onDownloaded={handleDownloaded}
            onDownloadingChange={setIsDownloading}
            onOpenChange={handleOpenChange}
            year={year}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
