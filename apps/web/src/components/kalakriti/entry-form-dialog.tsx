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
import {
  getGroupEntryValidationErrors,
  getIndividualEntryValidationError,
} from "@/lib/kalakriti-entry-policy";
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
    maximumGroupSize: number;
    minimumGroupSize: number;
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
  entry?: KalakritiEntryRow;
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

function selectSessionId(state: {
  values: { sessionId: string; studentIds: string[] };
}): string {
  return state.values.sessionId;
}

function sessionOptionLabel(
  session: KalakritiEntrySession,
  includeCompetition: boolean
): string {
  const remaining = Math.max(0, session.capacity - session.entries.length);
  return [
    ...(includeCompetition ? [session.competition.name] : []),
    session.competition.participationMode === "group"
      ? `Group of ${session.competition.minimumGroupSize}–${session.competition.maximumGroupSize}`
      : "Individual",
    session.ageCategory.name,
    `${format(new Date(session.startAt), "dd MMM, h:mm a")}–${format(new Date(session.endAt), "h:mm a")}`,
    session.venue.name,
    `${remaining} ${remaining === 1 ? "place" : "places"} left`,
  ].join(" · ");
}

function StudentCombobox({
  description,
  label,
  maximum,
  students,
}: {
  description: string;
  label: string;
  maximum: number;
  students: readonly KalakritiEntryStudent[];
}) {
  const form = useResolvedForm(undefined, "StudentCombobox");

  return (
    <CustomField<string[]>
      description={description}
      isRequired
      label={label}
      name="studentIds"
    >
      {(field) => (
        <StudentComboboxControl
          field={field}
          maximum={maximum}
          students={students}
          submitted={form.state.submissionAttempts > 0}
        />
      )}
    </CustomField>
  );
}

function StudentComboboxControl({
  field,
  maximum,
  students,
  submitted,
}: {
  field: FormFieldApi<string[]>;
  maximum: number;
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
    field.handleChange(studentIds.slice(0, maximum))
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
          disabled={field.state.value.length >= maximum}
          id={field.name}
          onBlur={field.handleBlur}
          placeholder={
            field.state.value.length >= maximum
              ? `Maximum ${maximum} selected`
              : "Search eligible Students..."
          }
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
  entry,
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
    const selectedStudents = value.studentIds.flatMap((studentId) => {
      const student = studentMap.get(studentId);
      return student ? [student] : [];
    });
    if (selectedStudents.length !== value.studentIds.length) {
      context.addIssue({
        code: "custom",
        message: "One or more selected Students are no longer available",
        path: ["studentIds"],
      });
      return;
    }
    if (session.competition.participationMode === "group") {
      for (const message of getGroupEntryValidationErrors({
        editingEntryId: entry?.id,
        entries,
        session,
        students: selectedStudents,
      })) {
        context.addIssue({ code: "custom", message, path: ["studentIds"] });
      }
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
    for (const student of selectedStudents) {
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
      sessionId: entry?.sessionId ?? fixedSession?.id ?? "",
      studentIds: entry?.members.map((member) => member.studentId) ?? [],
    },
    onSubmit: async ({ value }) => {
      const session = sessions.find(
        (candidate) => candidate.id === value.sessionId
      );
      if (!session) {
        return;
      }
      const now = Date.now();
      if (entry) {
        const result = await zero.mutate(
          mutators.kalakritiEntry.replaceGroupMembers({
            auditEntryId: uuidv7(),
            entryId: entry.id,
            members: value.studentIds.map((studentId) => ({
              memberId: uuidv7(),
              studentId,
            })),
            now,
          })
        ).server;
        handleMutationResult(result, {
          entityId: entry.id,
          errorMsg: "Failed to update Competition group",
          mutation: "kalakritiEntry.replaceGroupMembers",
          successMsg: "Competition group updated",
        });
        if (result.type !== "error") {
          onOpenChange(false);
        }
        return;
      }
      if (session.competition.participationMode === "group") {
        const result = await zero.mutate(
          mutators.kalakritiEntry.createGroup({
            auditEntryId: uuidv7(),
            centerId,
            editionId,
            entryId: uuidv7(),
            members: value.studentIds.map((studentId) => ({
              memberId: uuidv7(),
              studentId,
            })),
            now,
            sessionId: value.sessionId,
          })
        ).server;
        handleMutationResult(result, {
          entityId: value.sessionId,
          errorMsg: "Failed to register Competition group",
          mutation: "kalakritiEntry.createGroup",
          successMsg: "Competition group registered",
        });
        if (result.type !== "error") {
          onOpenChange(false);
        }
        return;
      }
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
      {fixedSession || entry ? null : (
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
      <form.Subscribe selector={selectSessionId}>
        {(sessionId) => {
          const session = sessions.find(
            (candidate) => candidate.id === sessionId
          );
          const isGroup =
            session?.competition.participationMode === "group";
          const maximum = isGroup
            ? (session?.competition.maximumGroupSize ?? 1)
            : Math.max(
                1,
                (session?.capacity ?? 1) - (session?.entries.length ?? 0)
              );
          return (
            <StudentCombobox
              description={
                isGroup
                  ? `Select ${session?.competition.minimumGroupSize ?? 1} to ${maximum} Students. Every member is checked against eligibility, limits, and schedule conflicts.`
                  : "Select one or more eligible Students for this Session."
              }
              label={isGroup ? "Group members" : "Students"}
              maximum={maximum}
              students={students}
            />
          );
        }}
      </form.Subscribe>
      <FormActions
        onCancel={handleCancel}
        submitLabel={
          entry
            ? "Save Group"
            : fixedSession?.competition.participationMode === "group"
              ? "Register Group"
              : "Register Entries"
        }
        submittingLabel={entry ? "Saving..." : "Registering..."}
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
          <DialogTitle>
            {props.entry
              ? "Edit Competition Group"
              : props.fixedSession?.competition.participationMode === "group"
                ? "Register Competition Group"
                : "Register Competition Entries"}
          </DialogTitle>
          <DialogDescription>
            {props.entry
              ? "Update the Students in this group. The existing group remains unchanged if validation fails."
              : props.fixedSession
                ? `Register eligible Students for ${props.fixedSession.competition.name} · ${props.fixedSession.ageCategory.name} · ${format(new Date(props.fixedSession.startAt), "dd MMM, h:mm a")} · ${props.fixedSession.venue.name}.`
                : "Choose eligible Students and a Competition Session."}
          </DialogDescription>
        </DialogHeader>
        <EntryForm key={formKey} {...props} />
      </DialogContent>
    </Dialog>
  );
}
