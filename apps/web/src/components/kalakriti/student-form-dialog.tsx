import { Checkbox } from "@pi-dash/design-system/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { normalizeKalakritiStudentName } from "@pi-dash/shared/kalakriti";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { format } from "date-fns";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { CustomField } from "@/components/form/custom-field";
import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import type {
  FormFieldApi,
  FormInstance,
} from "@/components/form/form-context";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import { handleMutationResult } from "@/lib/mutation-result";

export interface KalakritiStudentRow {
  ageCategory?: { name: string } | null;
  ageCategoryId: string;
  ageCategoryOverrideReason: string | null;
  centerId: string;
  dateOfBirth: number;
  derivedAgeCategory?: { name: string } | null;
  derivedAgeCategoryId: string;
  entryMemberships?: readonly { id: string }[];
  gender: "female" | "male";
  humanId: string;
  id: string;
  name: string;
}

interface AgeCategoryOption {
  id: string;
  name: string;
}

interface StudentFormDialogProps {
  ageCategories: AgeCategoryOption[];
  canOverrideAgeCategory: boolean;
  centerId: string;
  editionId: string;
  existingStudents: KalakritiStudentRow[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  student?: KalakritiStudentRow | null;
}

const studentFormSchema = z.object({
  ageCategoryOverrideId: z.string(),
  ageCategoryOverrideReason: z.string().max(500),
  dateOfBirth: z.date({ error: "Choose a date of birth" }),
  duplicateConfirmed: z.boolean(),
  gender: z.enum(["female", "male"], { error: "Choose a gender" }),
  name: z.string().trim().min(2, "Enter at least two characters").max(160),
});
const DERIVED_AGE_CATEGORY = "__derived__";

interface StudentSubmissionValues {
  ageCategoryOverrideId: string;
  ageCategoryOverrideReason: string;
  dateOfBirth: Date;
  duplicateConfirmed: boolean;
  gender: "female" | "male";
  name: string;
}

function datesMatch(date: Date, timestamp: number): boolean {
  return (
    format(date, "yyyy-MM-dd") === format(new Date(timestamp), "yyyy-MM-dd")
  );
}

function studentMutationValues(value: StudentSubmissionValues) {
  const usesDerivedCategory =
    value.ageCategoryOverrideId === DERIVED_AGE_CATEGORY;
  return {
    ageCategoryOverrideId: usesDerivedCategory
      ? null
      : value.ageCategoryOverrideId,
    ageCategoryOverrideReason: usesDerivedCategory
      ? null
      : value.ageCategoryOverrideReason || null,
    dateOfBirth: format(value.dateOfBirth, "yyyy-MM-dd"),
    duplicateConfirmed: value.duplicateConfirmed,
    gender: value.gender,
    name: value.name,
  };
}

async function createCredentialTokenHash(): Promise<string> {
  const opaqueValue = crypto.getRandomValues(new Uint8Array(32));
  const digest = await crypto.subtle.digest("SHA-256", opaqueValue);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function DuplicateWarning({
  duplicate,
  canOverrideAgeCategory,
  form,
}: {
  canOverrideAgeCategory: boolean;
  duplicate: KalakritiStudentRow | undefined;
  form: FormInstance;
}) {
  if (!duplicate) {
    return null;
  }

  return (
    <div className="space-y-3 border border-amber-500/50 bg-amber-50 p-3 text-sm dark:bg-amber-950/20">
      <p className="font-medium" role="alert">
        {duplicate.name} ({duplicate.humanId}) has the same normalized name and
        date of birth at this Center.
      </p>
      {canOverrideAgeCategory ? (
        <CustomField<boolean>
          form={form}
          label="I have reviewed this possible duplicate and approve creating this Student"
          name="duplicateConfirmed"
        >
          {(field) => <DuplicateConfirmationControl field={field} />}
        </CustomField>
      ) : (
        <p>Only an Edition administrator can register a possible duplicate.</p>
      )}
    </div>
  );
}

function DuplicateConfirmationControl({
  field,
}: {
  field: FormFieldApi<boolean>;
}) {
  const handleCheckedChange = useEventCallback((checked: boolean) =>
    field.handleChange(checked)
  );
  return (
    <Checkbox
      aria-label="Confirm possible duplicate"
      checked={field.state.value}
      id={field.name}
      onCheckedChange={handleCheckedChange}
    />
  );
}

function StudentForm({
  ageCategories,
  canOverrideAgeCategory,
  centerId,
  editionId,
  existingStudents,
  onOpenChange,
  student,
}: Omit<StudentFormDialogProps, "open">) {
  const zero = useZero();
  const isEditing = student !== null && student !== undefined;
  const validationSchema = studentFormSchema.superRefine((value, context) => {
    if (
      value.ageCategoryOverrideId !== DERIVED_AGE_CATEGORY &&
      !value.ageCategoryOverrideReason.trim()
    ) {
      context.addIssue({
        code: "custom",
        message: "Enter a reason for the Age Category override",
        path: ["ageCategoryOverrideReason"],
      });
    }
    if (!value.dateOfBirth) {
      return;
    }
    const duplicate = existingStudents.find(
      (candidate) =>
        candidate.id !== student?.id &&
        normalizeKalakritiStudentName(candidate.name).normalizedName ===
          normalizeKalakritiStudentName(value.name).normalizedName &&
        datesMatch(value.dateOfBirth, candidate.dateOfBirth)
    );
    if (!duplicate) {
      return;
    }
    if (!canOverrideAgeCategory) {
      context.addIssue({
        code: "custom",
        message:
          "Only an Edition administrator can register a possible duplicate",
        path: ["name"],
      });
    } else if (!value.duplicateConfirmed) {
      context.addIssue({
        code: "custom",
        message: "Confirm this possible duplicate before continuing",
        path: ["duplicateConfirmed"],
      });
    }
  });
  const submitStudentUpdate = async (
    value: StudentSubmissionValues,
    existingStudent: KalakritiStudentRow
  ) => {
    const result = await zero.mutate(
      mutators.kalakritiStudent.update({
        ...studentMutationValues(value),
        auditEntryId: uuidv7(),
        now: Date.now(),
        studentId: existingStudent.id,
      })
    ).server;
    handleMutationResult(result, {
      entityId: existingStudent.id,
      errorMsg: "Failed to update Student",
      mutation: "kalakritiStudent.update",
      successMsg: "Student updated",
    });
    if (result.type !== "error") {
      onOpenChange(false);
    }
  };
  const submitStudentCreate = async (value: StudentSubmissionValues) => {
    const result = await zero.mutate(
      mutators.kalakritiStudent.create({
        ...studentMutationValues(value),
        auditEntryId: uuidv7(),
        centerId,
        credentialId: uuidv7(),
        credentialTokenHash: await createCredentialTokenHash(),
        editionId,
        now: Date.now(),
        studentId: uuidv7(),
      })
    ).server;
    handleMutationResult(result, {
      entityId: centerId,
      errorMsg: "Failed to register Student",
      mutation: "kalakritiStudent.create",
      successMsg: "Student registered",
    });
    if (result.type !== "error") {
      onOpenChange(false);
    }
  };
  const form = useForm({
    defaultValues: {
      ageCategoryOverrideId:
        student && student.ageCategoryId !== student.derivedAgeCategoryId
          ? student.ageCategoryId
          : DERIVED_AGE_CATEGORY,
      ageCategoryOverrideReason: student?.ageCategoryOverrideReason ?? "",
      dateOfBirth: student ? new Date(student.dateOfBirth) : undefined,
      duplicateConfirmed: false,
      gender: student?.gender ?? ("" as "" | "female" | "male"),
      name: student?.name ?? "",
    },
    onSubmit: async ({ value }) => {
      if (
        !(
          value.dateOfBirth &&
          (value.gender === "female" || value.gender === "male")
        )
      ) {
        return;
      }

      const submission = value as StudentSubmissionValues;
      if (student) {
        await submitStudentUpdate(submission, student);
        return;
      }
      await submitStudentCreate(submission);
    },
    validators: { onChange: validationSchema, onSubmit: validationSchema },
  });

  const handleCancel = useEventCallback(() => onOpenChange(false));
  const selectDuplicateValues = useEventCallback(
    (state: { values: { dateOfBirth: Date | undefined; name: string } }) => ({
      dateOfBirth: state.values.dateOfBirth,
      name: state.values.name,
    })
  );
  const overrideOptions = [
    { label: "Use derived category", value: DERIVED_AGE_CATEGORY },
    ...ageCategories.map((category) => ({
      label: category.name,
      value: category.id,
    })),
  ];

  return (
    <FormLayout form={form} showSubmitError>
      <InputField autoFocus isRequired label="Student name" name="name" />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          isRequired
          label="Date of birth"
          maxDate={new Date()}
          name="dateOfBirth"
        />
        <SelectField
          isRequired
          label="Gender"
          name="gender"
          options={[
            { label: "Female", value: "female" },
            { label: "Male", value: "male" },
          ]}
          placeholder="Choose gender"
        />
      </div>
      {canOverrideAgeCategory ? (
        <>
          <SelectField
            description="Leave empty to use the category derived from date of birth."
            label="Age Category override"
            name="ageCategoryOverrideId"
            options={overrideOptions}
            placeholder="Use derived category"
          />
          <InputField
            description="Required when an override category is selected."
            label="Override reason"
            name="ageCategoryOverrideReason"
          />
        </>
      ) : null}
      <form.Subscribe selector={selectDuplicateValues}>
        {({ dateOfBirth, name }) => {
          const duplicate = dateOfBirth
            ? existingStudents.find(
                (candidate) =>
                  candidate.id !== student?.id &&
                  normalizeKalakritiStudentName(candidate.name)
                    .normalizedName ===
                    normalizeKalakritiStudentName(name).normalizedName &&
                  datesMatch(dateOfBirth, candidate.dateOfBirth)
              )
            : undefined;
          const duplicateBlocked = Boolean(
            duplicate && !canOverrideAgeCategory
          );
          return (
            <>
              <DuplicateWarning
                canOverrideAgeCategory={canOverrideAgeCategory}
                duplicate={duplicate}
                form={form}
              />
              <FormActions
                disabled={duplicateBlocked}
                onCancel={handleCancel}
                submitLabel={isEditing ? "Save Student" : "Register Student"}
                submittingLabel={isEditing ? "Saving..." : "Registering..."}
              />
            </>
          );
        }}
      </form.Subscribe>
    </FormLayout>
  );
}

export function StudentFormDialog(props: StudentFormDialogProps) {
  const [formKey, setFormKey] = useState(0);
  const handleOpenChange = useEventCallback((open: boolean) => {
    if (open) {
      setFormKey((key) => key + 1);
    }
    props.onOpenChange(open);
  });

  return (
    <Dialog onOpenChange={handleOpenChange} open={props.open}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {props.student ? "Edit Student" : "Register Student"}
          </DialogTitle>
          <DialogDescription>
            {props.student
              ? "Update this Student's registration details."
              : "A yearly Student ID and credential are created automatically."}
          </DialogDescription>
        </DialogHeader>
        <StudentForm key={formKey} {...props} />
      </DialogContent>
    </Dialog>
  );
}
