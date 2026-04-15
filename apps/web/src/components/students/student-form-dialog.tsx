import { cityValues } from "@pi-dash/shared/constants";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { Center } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
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
import { cityOptions } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";

const genderOptions = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
];

const studentFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  dateOfBirth: z.date().optional(),
  gender: z.string().optional(),
  centerId: z.string().optional(),
  city: z.enum(cityValues),
  notes: z.string().optional(),
});

type StudentFormValues = z.infer<typeof studentFormSchema>;

interface StudentFormDialogProps {
  defaultCenterId?: string;
  initialValues?: {
    id: string;
    name: string;
    dateOfBirth: number | null;
    gender: "male" | "female" | null;
    centerId: string | null;
    city: string;
    notes: string | null;
  };
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** When true, only DOB is editable (non-admin editing a student who has attended a class) */
  restrictedEdit?: boolean;
}

function getDefaultValues(
  initialValues: StudentFormDialogProps["initialValues"],
  defaultCenterId?: string
): StudentFormValues {
  return {
    name: initialValues?.name ?? "",
    dateOfBirth: initialValues?.dateOfBirth
      ? new Date(initialValues.dateOfBirth)
      : undefined,
    gender: initialValues?.gender ?? "",
    centerId: initialValues?.centerId ?? defaultCenterId ?? "",
    city: (initialValues?.city as (typeof cityValues)[number]) ?? "bangalore",
    notes: initialValues?.notes ?? "",
  };
}

function StudentFormContent({
  defaultCenterId,
  initialValues,
  onOpenChange,
  restrictedEdit = false,
}: {
  defaultCenterId?: string;
  initialValues?: StudentFormDialogProps["initialValues"];
  onOpenChange: (open: boolean) => void;
  restrictedEdit?: boolean;
}) {
  const zero = useZero();
  const isEdit = !!initialValues;

  const [centers] = useQuery(queries.center.all());
  const centerOptions = [
    { label: "None", value: "" },
    ...(centers ?? []).map((c: Center) => ({
      label: c.name,
      value: c.id,
    })),
  ];

  const form = useForm({
    defaultValues: getDefaultValues(initialValues, defaultCenterId),
    onSubmit: async ({ value }) => {
      const dateOfBirthMs = value.dateOfBirth
        ? value.dateOfBirth.getTime()
        : null;
      const now = Date.now();
      let mutation: ReturnType<typeof zero.mutate>;
      if (restrictedEdit && isEdit) {
        // Non-admin editing student who has attended — DOB only
        mutation = zero.mutate(
          mutators.student.update({
            id: initialValues.id,
            dateOfBirth: dateOfBirthMs,
            now,
          })
        );
      } else if (isEdit) {
        mutation = zero.mutate(
          mutators.student.update({
            id: initialValues.id,
            name: value.name.trim(),
            dateOfBirth: dateOfBirthMs,
            gender: (value.gender as "male" | "female") || undefined,
            centerId: value.centerId || undefined,
            city: value.city,
            notes: value.notes?.trim() || undefined,
            now,
          })
        );
      } else {
        mutation = zero.mutate(
          mutators.student.create({
            id: uuidv7(),
            name: value.name.trim(),
            dateOfBirth: dateOfBirthMs,
            gender: (value.gender as "male" | "female") || undefined,
            centerId: value.centerId || undefined,
            city: value.city,
            notes: value.notes?.trim() || undefined,
            now,
          })
        );
      }
      const res = await mutation.server;
      handleMutationResult(res, {
        mutation: isEdit ? "student.update" : "student.create",
        entityId: isEdit ? initialValues.id : "new",
        successMsg: isEdit ? "Student updated" : "Student created",
        errorMsg: isEdit
          ? "Couldn't update student"
          : "Couldn't create student",
      });
      if (res.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: {
      onChange: studentFormSchema,
      onSubmit: studentFormSchema,
    },
  });

  return (
    <FormLayout form={form}>
      <InputField
        disabled={restrictedEdit}
        isRequired
        label="Name"
        name="name"
        placeholder="Student name"
      />
      <DateField
        endMonth={new Date()}
        label="Date of Birth"
        maxDate={new Date()}
        name="dateOfBirth"
        placeholder="Pick date of birth"
        startMonth={new Date(2005, 0, 1)}
      />
      <SelectField
        disabled={restrictedEdit}
        label="Gender"
        name="gender"
        options={genderOptions}
        placeholder="Select gender"
      />
      <SelectField
        disabled={restrictedEdit}
        label="Center"
        name="centerId"
        options={centerOptions}
        placeholder="Select center"
      />
      <SelectField
        disabled={restrictedEdit}
        isRequired
        label="City"
        name="city"
        options={cityOptions}
        placeholder="Select city"
      />
      <TextareaField
        disabled={restrictedEdit}
        label="Notes"
        name="notes"
        placeholder="Optional notes"
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

export function StudentFormDialog({
  defaultCenterId,
  initialValues,
  onOpenChange,
  open,
  restrictedEdit = false,
}: StudentFormDialogProps) {
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Student" : "Create Student"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? "Edit student details" : "Create a new student"}
          </DialogDescription>
        </DialogHeader>
        <StudentFormContent
          defaultCenterId={defaultCenterId}
          initialValues={initialValues}
          key={formKey}
          onOpenChange={onOpenChange}
          restrictedEdit={restrictedEdit}
        />
      </DialogContent>
    </Dialog>
  );
}
