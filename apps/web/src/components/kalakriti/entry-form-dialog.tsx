import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@pi-dash/design-system/components/ui/combobox";
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
import { format } from "date-fns";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import {
  type FormFieldApi,
  fieldErrorProps,
  useResolvedForm,
} from "@/components/form/form-context";
import { FormLayout } from "@/components/form/form-layout";
import { SelectField } from "@/components/form/select-field";
import { getIndividualEntryValidationError } from "@/lib/kalakriti-entry-policy";
import { handleMutationResult } from "@/lib/mutation-result";

export interface KalakritiEntryStudent {
  ageCategory: {
    maxCompetitionsPerCategory: number;
    maxTotalCompetitions: number;
    name: string;
  };
  ageCategoryId: string;
  gender: "female" | "male";
  humanId: string;
  id: string;
  name: string;
}

export interface KalakritiEntrySession {
  ageCategory: { name: string };
  ageCategoryId: string;
  capacity: number;
  competition: {
    category: { name: string };
    competitionCategoryId: string;
    genderEligibility: "both" | "female" | "male";
    id: string;
    name: string;
    participationMode: "group" | "individual";
  };
  endAt: number;
  entries: readonly { id: string }[];
  id: string;
  startAt: number;
  venue: { name: string };
}

export interface KalakritiEntryRow {
  id: string;
  members: readonly {
    student: KalakritiEntryStudent;
    studentId: string;
  }[];
  participationMode: "group" | "individual";
  session: KalakritiEntrySession;
  sessionId: string;
}

interface EntryFormDialogProps {
  centerId: string;
  editionId: string;
  entries: readonly KalakritiEntryRow[];
  fixedSession?: KalakritiEntrySession;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sessions: readonly KalakritiEntrySession[];
  students: readonly KalakritiEntryStudent[];
}

const entryFormSchema = z.object({
  sessionId: z.string().min(1, "Choose a Competition Session"),
  studentId: z.string().min(1, "Choose a Student"),
});

function sessionOptionLabel(
  session: KalakritiEntrySession,
  includeCompetition: boolean
): string {
  const remaining = Math.max(0, session.capacity - session.entries.length);
  return [
    ...(includeCompetition ? [session.competition.name] : []),
    session.ageCategory.name,
    `${format(new Date(session.startAt), "dd MMM, h:mm a")}–${format(new Date(session.endAt), "h:mm a")}`,
    session.venue.name,
    `${remaining} ${remaining === 1 ? "place" : "places"} left`,
  ].join(" · ");
}

function StudentCombobox({
  students,
}: {
  students: readonly KalakritiEntryStudent[];
}) {
  const form = useResolvedForm(undefined, "StudentCombobox");
  const studentIds = students.map((student) => student.id);
  const studentLabels = new Map(
    students.map((student) => [
      student.id,
      `${student.humanId} · ${student.name} · ${student.ageCategory.name}`,
    ])
  );
  const itemToStringLabel = useEventCallback(
    (studentId: string) => studentLabels.get(studentId) ?? studentId
  );

  return (
    <CustomField<string> isRequired label="Student" name="studentId">
      {(field) => (
        <StudentComboboxControl
          field={field}
          itemToStringLabel={itemToStringLabel}
          studentIds={studentIds}
          submitted={form.state.submissionAttempts > 0}
        />
      )}
    </CustomField>
  );
}

function StudentComboboxControl({
  field,
  itemToStringLabel,
  studentIds,
  submitted,
}: {
  field: FormFieldApi<string>;
  itemToStringLabel: (studentId: string) => string;
  studentIds: string[];
  submitted: boolean;
}) {
  const handleValueChange = useEventCallback((studentId: string | null) =>
    field.handleChange(studentId ?? "")
  );

  return (
    <Combobox
      items={studentIds}
      itemToStringLabel={itemToStringLabel}
      onValueChange={handleValueChange}
      value={field.state.value}
    >
      <ComboboxInput
        {...fieldErrorProps(field, submitted)}
        aria-required="true"
        className="w-full"
        id={field.name}
        onBlur={field.handleBlur}
        placeholder="Search eligible Students..."
        showClear={Boolean(field.state.value)}
      />
      <ComboboxContent>
        <ComboboxList>
          {(studentId) => (
            <ComboboxItem key={studentId} value={studentId}>
              {itemToStringLabel(studentId)}
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxEmpty>No eligible Students found.</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}

function EntryForm({
  centerId,
  editionId,
  entries,
  fixedSession,
  onOpenChange,
  sessions,
  students,
}: Omit<EntryFormDialogProps, "open">) {
  const zero = useZero();
  const validationSchema = entryFormSchema.superRefine((value, context) => {
    const student = students.find(
      (candidate) => candidate.id === value.studentId
    );
    const session = sessions.find(
      (candidate) => candidate.id === value.sessionId
    );
    if (!(student && session)) {
      return;
    }
    const message = getIndividualEntryValidationError({
      entries,
      session,
      student,
    });
    if (message) {
      context.addIssue({
        code: "custom",
        message,
        path: [fixedSession ? "studentId" : "sessionId"],
      });
    }
  });
  const form = useForm({
    defaultValues: {
      sessionId: fixedSession?.id ?? "",
      studentId: "",
    },
    onSubmit: async ({ value }) => {
      const result = await zero.mutate(
        mutators.kalakritiEntry.createIndividual({
          auditEntryId: uuidv7(),
          centerId,
          editionId,
          entryId: uuidv7(),
          memberId: uuidv7(),
          now: Date.now(),
          sessionId: value.sessionId,
          studentId: value.studentId,
        })
      ).server;
      handleMutationResult(result, {
        entityId: value.studentId,
        errorMsg: "Failed to register Competition Entry",
        mutation: "kalakritiEntry.createIndividual",
        successMsg: "Competition Entry registered",
      });
      if (result.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: { onChange: validationSchema, onSubmit: validationSchema },
  });
  const handleCancel = useEventCallback(() => onOpenChange(false));

  return (
    <FormLayout form={form} showSubmitError>
      <StudentCombobox students={students} />
      {fixedSession ? null : (
        <SelectField
          description="Availability is rechecked when you submit, so a place cannot be overbooked."
          isRequired
          label="Competition Session"
          name="sessionId"
          options={sessions.map((session) => ({
            label: sessionOptionLabel(session, true),
            value: session.id,
          }))}
          placeholder="Choose Session"
        />
      )}
      <FormActions
        onCancel={handleCancel}
        submitLabel="Register Entry"
        submittingLabel="Registering..."
      />
    </FormLayout>
  );
}

export function EntryFormDialog(props: EntryFormDialogProps) {
  const [formKey, setFormKey] = useState(0);
  const handleOpenChange = useEventCallback((open: boolean) => {
    if (open) {
      setFormKey((key) => key + 1);
    }
    props.onOpenChange(open);
  });

  return (
    <Dialog onOpenChange={handleOpenChange} open={props.open}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Register Competition Entry</DialogTitle>
          <DialogDescription>
            {props.fixedSession
              ? `Register one Student for ${props.fixedSession.competition.name} · ${props.fixedSession.ageCategory.name} · ${format(new Date(props.fixedSession.startAt), "dd MMM, h:mm a")} · ${props.fixedSession.venue.name}.`
              : "Choose one Student and an eligible individual Competition Session."}
          </DialogDescription>
        </DialogHeader>
        <EntryForm key={formKey} {...props} />
      </DialogContent>
    </Dialog>
  );
}
