import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
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

import { type DocumentOption, NO_DOCUMENT } from "./evidence";
import { dateToIso, formatIso } from "./register-data";

const FUTURE_MONTH = new Date(2100, 11, 1);

interface ComplianceItemRef {
  id: string;
  title: string;
}

function ComplianceDialog({
  children,
  description,
  onClose,
  open,
  title,
}: {
  children: ReactNode;
  description: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  const handleOpenChange = useEventCallback((next: boolean) => {
    if (!next) {
      onClose();
    }
  });
  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open ? children : null}
      </DialogContent>
    </Dialog>
  );
}

function AddForm({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (title: string, dueOn: string) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: { dueOn: undefined as Date | undefined, title: "" },
    onSubmit: async ({ value }) => {
      const dueOn = dateToIso(value.dueOn);
      if (!(value.title.trim() && dueOn)) {
        toast.error("Give the item a title and the day it's due.");
        return;
      }
      await onSubmit(value.title.trim(), dueOn);
    },
  });
  const cancel = useEventCallback(onClose);
  return (
    <FormLayout form={form}>
      <InputField isRequired label="Title" name="title" />
      <DateField
        endMonth={FUTURE_MONTH}
        isRequired
        label="Due on"
        name="dueOn"
      />
      <FormActions
        disableWhenInvalid={false}
        onCancel={cancel}
        submitLabel="Add item"
        submittingLabel="Adding..."
      />
    </FormLayout>
  );
}

/** A one-off deadline outside the recurring items. */
export function AddItemDialog({
  onClose,
  onSubmit,
  open,
}: {
  onClose: () => void;
  onSubmit: (title: string, dueOn: string) => Promise<void>;
  open: boolean;
}) {
  return (
    <ComplianceDialog
      description="A one-off deadline outside the recurring items."
      onClose={onClose}
      open={open}
      title="Add an item"
    >
      <AddForm onClose={onClose} onSubmit={onSubmit} />
    </ComplianceDialog>
  );
}

function MarkDoneForm({
  documents,
  item,
  onClose,
  onSubmit,
}: {
  documents: readonly DocumentOption[];
  item: ComplianceItemRef;
  onClose: () => void;
  onSubmit: (
    item: ComplianceItemRef,
    documentId: string,
    note: string
  ) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: { documentId: NO_DOCUMENT, note: "" },
    onSubmit: async ({ value }) => {
      if (value.documentId === NO_DOCUMENT) {
        toast.error("Choose the document that proves it.");
        return;
      }
      await onSubmit(item, value.documentId, value.note.trim());
    },
  });
  const cancel = useEventCallback(onClose);
  return (
    <FormLayout form={form}>
      <SelectField
        description={
          <>
            The acknowledgement, filing or signed record.{" "}
            <Link
              className="text-primary underline-offset-4 hover:underline"
              to="/governance/documents"
            >
              Add it to the vault
            </Link>{" "}
            first if it isn't there.
          </>
        }
        isRequired
        label="Evidence"
        name="documentId"
        options={[
          { label: "Choose a document", value: NO_DOCUMENT },
          ...documents.map((d) => ({
            label: `${d.title} · ${formatIso(d.datedOn)}`,
            value: d.id,
          })),
        ]}
      />
      <TextareaField label="Note" name="note" rows={2} />
      <FormActions
        disableWhenInvalid={false}
        onCancel={cancel}
        submitLabel="Mark done"
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

export function MarkDoneDialog({
  documents,
  item,
  onClose,
  onSubmit,
}: {
  documents: readonly DocumentOption[];
  item: ComplianceItemRef | null;
  onClose: () => void;
  onSubmit: (
    item: ComplianceItemRef,
    documentId: string,
    note: string
  ) => Promise<void>;
}) {
  return (
    <ComplianceDialog
      description={item?.title}
      onClose={onClose}
      open={item !== null}
      title="Mark done"
    >
      {item ? (
        <MarkDoneForm
          documents={documents}
          item={item}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      ) : null}
    </ComplianceDialog>
  );
}

function NotNeededForm({
  item,
  onClose,
  onSubmit,
}: {
  item: ComplianceItemRef;
  onClose: () => void;
  onSubmit: (item: ComplianceItemRef, reason: string) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: { reason: "" },
    onSubmit: async ({ value }) => {
      if (!value.reason.trim()) {
        toast.error("Say why it isn't needed.");
        return;
      }
      await onSubmit(item, value.reason.trim());
    },
  });
  const cancel = useEventCallback(onClose);
  return (
    <FormLayout form={form}>
      <TextareaField isRequired label="Reason" name="reason" rows={3} />
      <FormActions
        disableWhenInvalid={false}
        onCancel={cancel}
        submitLabel="Mark not needed"
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

export function NotNeededDialog({
  item,
  onClose,
  onSubmit,
}: {
  item: ComplianceItemRef | null;
  onClose: () => void;
  onSubmit: (item: ComplianceItemRef, reason: string) => Promise<void>;
}) {
  return (
    <ComplianceDialog
      description="Say why it isn't needed this time; it stays on the calendar as closed."
      onClose={onClose}
      open={item !== null}
      title="Not needed this time"
    >
      {item ? (
        <NotNeededForm item={item} onClose={onClose} onSubmit={onSubmit} />
      ) : null}
    </ComplianceDialog>
  );
}

const SECRETARIES = "";

function AssignForm({
  item,
  onClose,
  onSubmit,
  owners,
}: {
  item: ComplianceItemRef;
  onClose: () => void;
  onSubmit: (
    item: ComplianceItemRef,
    ownerUserId: string | null
  ) => Promise<void>;
  owners: { id: string; name: string }[];
}) {
  const form = useForm({
    defaultValues: { owner: SECRETARIES },
    onSubmit: async ({ value }) => {
      await onSubmit(item, value.owner || null);
    },
  });
  const cancel = useEventCallback(onClose);
  return (
    <FormLayout form={form}>
      <SelectField
        label="Owner"
        name="owner"
        options={[
          {
            label: "Secretaries (everyone who manages governance)",
            value: SECRETARIES,
          },
          ...owners.map((o) => ({ label: o.name, value: o.id })),
        ]}
      />
      <FormActions
        disableWhenInvalid={false}
        onCancel={cancel}
        submitLabel="Assign owner"
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

export function AssignDialog({
  item,
  onClose,
  onSubmit,
  owners,
}: {
  item: ComplianceItemRef | null;
  onClose: () => void;
  onSubmit: (
    item: ComplianceItemRef,
    ownerUserId: string | null
  ) => Promise<void>;
  owners: { id: string; name: string }[];
}) {
  return (
    <ComplianceDialog
      description={item?.title}
      onClose={onClose}
      open={item !== null}
      title="Assign an owner"
    >
      {item ? (
        <AssignForm
          item={item}
          onClose={onClose}
          onSubmit={onSubmit}
          owners={owners}
        />
      ) : null}
    </ComplianceDialog>
  );
}
