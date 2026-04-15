import { cityValues } from "@pi-dash/shared/constants";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
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
import { cityOptions } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";

const centerFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  city: z.enum(cityValues, { message: "City is required" }),
  address: z.string().optional(),
});

type CenterFormValues = z.infer<typeof centerFormSchema>;

interface CenterFormDialogProps {
  initialValues?: {
    id: string;
    name: string;
    city: "bangalore" | "mumbai" | null;
    address: string | null;
  };
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function getDefaultValues(
  initialValues?: CenterFormDialogProps["initialValues"]
): CenterFormValues {
  return {
    name: initialValues?.name ?? "",
    city: (initialValues?.city as (typeof cityValues)[number]) ?? "bangalore",
    address: initialValues?.address ?? "",
  };
}

function CenterFormContent({
  initialValues,
  onOpenChange,
}: {
  initialValues?: CenterFormDialogProps["initialValues"];
  onOpenChange: (open: boolean) => void;
}) {
  const zero = useZero();
  const isEdit = !!initialValues;

  const form = useForm({
    defaultValues: getDefaultValues(initialValues),
    onSubmit: async ({ value }) => {
      const mutation = isEdit
        ? zero.mutate(
            mutators.center.update({
              id: initialValues.id,
              name: value.name.trim(),
              city: value.city,
              address: value.address?.trim() || undefined,
              now: Date.now(),
            })
          )
        : zero.mutate(
            mutators.center.create({
              id: uuidv7(),
              name: value.name.trim(),
              city: value.city,
              address: value.address?.trim() || undefined,
              now: Date.now(),
            })
          );
      const res = await mutation.server;
      handleMutationResult(res, {
        mutation: isEdit ? "center.update" : "center.create",
        entityId: isEdit ? initialValues.id : "new",
        successMsg: isEdit ? "Center updated" : "Center created",
        errorMsg: isEdit ? "Couldn't update center" : "Couldn't create center",
      });
      if (res.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: {
      onChange: centerFormSchema,
      onSubmit: centerFormSchema,
    },
  });

  return (
    <FormLayout form={form}>
      <InputField
        isRequired
        label="Name"
        name="name"
        placeholder="Center name"
      />
      <SelectField
        isRequired
        label="City"
        name="city"
        options={cityOptions}
        placeholder="Select city"
      />
      <TextareaField
        label="Address"
        name="address"
        placeholder="Optional address"
        rows={3}
      />
      <FormActions
        onCancel={() => onOpenChange(false)}
        submitLabel={isEdit ? "Save" : "Create"}
        submittingLabel={isEdit ? "Saving..." : "Creating..."}
      />
    </FormLayout>
  );
}

export function CenterFormDialog({
  initialValues,
  onOpenChange,
  open,
}: CenterFormDialogProps) {
  const isEdit = !!initialValues;
  const [formKey, setFormKey] = useState(0);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((k) => k + 1);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Center" : "Create Center"}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? "Edit center details" : "Create a new center"}
          </DialogDescription>
        </DialogHeader>
        <CenterFormContent
          initialValues={initialValues}
          key={formKey}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}
