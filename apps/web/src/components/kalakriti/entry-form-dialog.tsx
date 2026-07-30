import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
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
  studentIds: z.array(z.string()).min(1, "Choose at least one Student"),
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

  return (
    <CustomField<string[]> isRequired label="Students" name="studentIds">
      {(field) => (
        <StudentComboboxControl
          field={field}
          students={students}
          submitted={form.state.submissionAttempts > 0}
        />
      )}
    </CustomField>
  );
}

function StudentComboboxControl({
  field,
  students,
  submitted,
}: {
  field: FormFieldApi<string[]>;
  students: readonly KalakritiEntryStudent[];
  submitted: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const anchorRef = useComboboxAnchor();
  const studentMap = new Map(students.map((student) => [student.id, student]));
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredStudents = normalizedQuery
    ? students.filter((student) =>
        [student.humanId, student.name, student.ageCategory.name]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      )
    : students;
  const handleValueChange = useEventCallback((studentIds: string[]) =>
    field.handleChange(studentIds)
  );

  return (
    <Combobox
      filter={null}
      inputValue={searchQuery}
      multiple
      onInputValueChange={setSearchQuery}
      onValueChange={handleValueChange}
      value={field.state.value}
    >
      <ComboboxChips {...fieldErrorProps(field, submitted)} ref={anchorRef}>
        {field.state.value.map((studentId) => (
          <ComboboxChip key={studentId}>
            {studentMap.get(studentId)?.name ?? studentId}
          </ComboboxChip>
        ))}
        <ComboboxChipsInput
          aria-required="true"
          id={field.name}
          onBlur={field.handleBlur}
          placeholder="Search eligible Students..."
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchorRef}>
        <ComboboxList>
          {filteredStudents.map((student) => (
            <ComboboxItem key={student.id} value={student.id}>
              {student.humanId} · {student.name} · {student.ageCategory.name}
            </ComboboxItem>
          ))}
          {filteredStudents.length === 0 ? (
            <div className="py-2 text-center text-muted-foreground text-xs">
              No eligible Students found.
            </div>
          ) : null}
        </ComboboxList>
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
  const studentMap = new Map(students.map((student) => [student.id, student]));
  const validationSchema = entryFormSchema.superRefine((value, context) => {
    const session = sessions.find(
      (candidate) => candidate.id === value.sessionId
    );
    if (!session) {
      return;
    }
    const remainingCapacity = session.capacity - session.entries.length;
    if (value.studentIds.length > remainingCapacity) {
      context.addIssue({
        code: "custom",
        message: `This Session only has ${Math.max(0, remainingCapacity)} places left`,
        path: ["studentIds"],
      });
      return;
    }
    for (const studentId of value.studentIds) {
      const student = studentMap.get(studentId);
      if (!student) {
        continue;
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
          path: [fixedSession ? "studentIds" : "sessionId"],
        });
        return;
      }
    }
  });
  const form = useForm({
    defaultValues: {
      sessionId: fixedSession?.id ?? "",
      studentIds: [] as string[],
    },
    onSubmit: async ({ value }) => {
      const now = Date.now();
      const results = await Promise.all(
        value.studentIds.map(
          (studentId) =>
            zero.mutate(
              mutators.kalakritiEntry.createIndividual({
                auditEntryId: uuidv7(),
                centerId,
                editionId,
                entryId: uuidv7(),
                memberId: uuidv7(),
                now,
                sessionId: value.sessionId,
                studentId,
              })
            ).server
        )
      );
      const failedResult = results.find((result) => result.type === "error");
      handleMutationResult(failedResult ?? { type: "complete" }, {
        entityId: value.studentIds.join(","),
        errorMsg: "Some Competition Entries could not be registered",
        mutation: "kalakritiEntry.createIndividual",
        successMsg:
          value.studentIds.length === 1
            ? "Competition Entry registered"
            : `${value.studentIds.length} Competition Entries registered`,
      });
      if (!failedResult) {
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
        submitLabel="Register Entries"
        submittingLabel="Registering Entries..."
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
          <DialogTitle>Register Competition Entries</DialogTitle>
          <DialogDescription>
            {props.fixedSession
              ? `Register eligible Students for ${props.fixedSession.competition.name} · ${props.fixedSession.ageCategory.name} · ${format(new Date(props.fixedSession.startAt), "dd MMM, h:mm a")} · ${props.fixedSession.venue.name}.`
              : "Choose eligible Students and an individual Competition Session."}
          </DialogDescription>
        </DialogHeader>
        <EntryForm key={formKey} {...props} />
      </DialogContent>
    </Dialog>
  );
}
