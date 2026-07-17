import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { handleMutationResult } from "@/lib/mutation-result";

const venueSchema = z.object({ name: z.string().trim().min(2).max(120) });

export interface VenueFormValue {
  id: string;
  name: string;
}

function VenueForm({
  editionId,
  onOpenChange,
  venue,
}: {
  editionId: string;
  onOpenChange: (open: boolean) => void;
  venue: VenueFormValue | null;
}) {
  const zero = useZero();
  const handleCancel = useEventCallback(() => onOpenChange(false));
  const form = useForm({
    defaultValues: { name: venue ? venue.name : "" },
    onSubmit: async ({ value }) => {
      const venueId = venue ? venue.id : uuidv7();
      const common = {
        ...value,
        auditEntryId: uuidv7(),
        now: Date.now(),
        venueId,
      };
      const result = venue
        ? await zero.mutate(mutators.kalakritiCompetition.updateVenue(common))
            .server
        : await zero.mutate(
            mutators.kalakritiCompetition.createVenue({
              ...common,
              editionId,
            })
          ).server;
      handleMutationResult(result, {
        entityId: venueId,
        errorMsg: venue ? "Failed to update Venue" : "Failed to create Venue",
        mutation: venue
          ? "kalakritiCompetition.updateVenue"
          : "kalakritiCompetition.createVenue",
        successMsg: venue ? "Venue updated" : "Venue created",
      });
      if (result.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: { onChange: venueSchema, onSubmit: venueSchema },
  });
  return (
    <FormLayout form={form}>
      <InputField autoFocus isRequired label="Venue name" name="name" />
      <FormActions
        onCancel={handleCancel}
        submitLabel={venue ? "Save Venue" : "Create Venue"}
        submittingLabel={venue ? "Saving..." : "Creating..."}
      />
    </FormLayout>
  );
}

export function VenueFormDialog({
  editionId,
  onOpenChange,
  open,
  venue,
}: {
  editionId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  venue: VenueFormValue | null;
}) {
  const [formKey, setFormKey] = useState(0);
  const handleOpenChange = useEventCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((key) => key + 1);
    }
    onOpenChange(nextOpen);
  });
  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{venue ? "Edit Venue" : "Add Venue"}</DialogTitle>
          <DialogDescription>
            Venues are reusable locations for the Edition schedule.
          </DialogDescription>
        </DialogHeader>
        <VenueForm
          editionId={editionId}
          key={formKey}
          onOpenChange={onOpenChange}
          venue={venue}
        />
      </DialogContent>
    </Dialog>
  );
}
