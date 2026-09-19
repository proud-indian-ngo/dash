import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useState } from "react";

import { KalakritiLocalVolunteerForm } from "@/components/kalakriti/kalakriti-local-volunteer-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";

export function KalakritiCreateVolunteerDialog({
  editionId,
  onOpenChange,
  open,
}: {
  editionId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [formKey, setFormKey] = useState(0);
  const handleOpenChange = useEventCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((current) => current + 1);
    }
    onOpenChange(nextOpen);
  });
  const handleCreated = useEventCallback(() => onOpenChange(false));
  const handleCancel = useEventCallback(() => onOpenChange(false));

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create volunteer</DialogTitle>
          <DialogDescription>
            Add this person to the Edition roster without email, phone, or a
            login. They can receive roles but cannot sign in.
          </DialogDescription>
        </DialogHeader>
        <KalakritiLocalVolunteerForm
          editionId={editionId}
          key={formKey}
          onCancel={handleCancel}
          onCreated={handleCreated}
          submitLabel="Create volunteer"
        />
      </DialogContent>
    </Dialog>
  );
}
