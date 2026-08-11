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
  getEntryStudentOptionEligibility,
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
  scheduleActive?: boolean;
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

const unavailableSessionMessage = "This Session is no longer available";

interface EntryMutationResult {
  error?: unknown;
  type: string;
}

interface EntryMutationMeta {
  entityId: string;
  errorMsg: string;
  mutation: string;
  successMsg: string;
}

function getMutationErrorMessage(result: EntryMutationResult): string | null {
  if (result.type !== "error") {
    return null;
  }
  if (result.error instanceof Error) {
    return result.error.message;
  }
  if (
    result.error &&
    typeof result.error === "object" &&
    "message" in result.error &&
    typeof result.error.message === "string"
  ) {
    return result.error.message;
  }
  return null;
}

function getSubmitLabel(
  entry: KalakritiEntryRow | undefined,
  fixedSession: KalakritiEntrySession | undefined
): string {
  if (entry) {
    return "Save Group";
  }
  if (!fixedSession) {
    return "Register Entries";
  }
  if (fixedSession.competition.participationMode === "group") {
    return "Register Group";
  }
  return "Register Entries";
}

function getDialogTitle(props: EntryFormDialogProps): string {
  if (props.entry) {
    return "Edit Competition Group";
  }
  if (!props.fixedSession) {
    return "Register Competition Entries";
  }
  if (props.fixedSession.competition.participationMode === "group") {
    return "Register Competition Group";
  }
  return "Register Competition Entries";
}

function getDialogDescription(props: EntryFormDialogProps): string {
  if (props.entry) {
    return "Update the Students in this group. The existing group remains unchanged if validation fails.";
  }
  if (props.fixedSession) {
    return `Register eligible Students for ${props.fixedSession.competition.name} · ${props.fixedSession.ageCategory.name} · ${format(new Date(props.fixedSession.startAt), "dd MMM, h:mm a")} · ${props.fixedSession.venue.name}.`;
  }
  return "Choose eligible Students and a Competition Session.";
}

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

interface EntryValidationIssue {
  message: string;
  path: "sessionId" | "studentIds";
}

function getIndividualSelectionIssue({
  entries,
  fixedSession,
  session,
  students,
}: {
  entries: readonly KalakritiEntryRow[];
  fixedSession?: KalakritiEntrySession;
  session: KalakritiEntrySession;
  students: readonly KalakritiEntryStudent[];
}): EntryValidationIssue | null {
  const remainingCapacity = session.capacity - session.entries.length;
  if (students.length > remainingCapacity) {
    return {
      message: `This Session only has ${Math.max(0, remainingCapacity)} places left`,
      path: "studentIds",
    };
  }
  for (const student of students) {
    const message = getIndividualEntryValidationError({
      entries,
      session,
      student,
    });
    if (message) {
      return {
        message,
        path: fixedSession ? "studentIds" : "sessionId",
      };
    }
  }
  return null;
}

function getEntryValidationIssues({
  entries,
  entry,
  fixedSession,
  sessionId,
  sessions,
  studentIds,
  studentMap,
}: {
  entries: readonly KalakritiEntryRow[];
  entry?: KalakritiEntryRow;
  fixedSession?: KalakritiEntrySession;
  sessionId: string;
  sessions: readonly KalakritiEntrySession[];
  studentIds: string[];
  studentMap: ReadonlyMap<string, KalakritiEntryStudent>;
}): EntryValidationIssue[] {
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session) {
    return sessionId
      ? [{ message: unavailableSessionMessage, path: "sessionId" }]
      : [];
  }
  const selectedStudents = studentIds.flatMap((studentId) => {
    const student = studentMap.get(studentId);
    return student ? [student] : [];
  });
  if (selectedStudents.length !== studentIds.length) {
    return [
      {
        message: "One or more selected Students are no longer available",
        path: "studentIds",
      },
    ];
  }
  if (session.competition.participationMode === "group") {
    return getGroupEntryValidationErrors({
      editingEntryId: entry?.id,
      entries,
      session,
      students: selectedStudents,
    }).map((message) => ({ message, path: "studentIds" }));
  }
  const issue = getIndividualSelectionIssue({
    entries,
    fixedSession,
    session,
    students: selectedStudents,
  });
  return issue ? [issue] : [];
}

function StudentCombobox({
  description,
  label,
  maximum,
  options,
}: {
  description: string;
  label: string;
  maximum: number;
  options: readonly StudentComboboxOption[];
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
          options={options}
          submitted={form.state.submissionAttempts > 0}
        />
      )}
    </CustomField>
  );
}

interface StudentComboboxOption {
  disabledReason: string | null;
  student: KalakritiEntryStudent;
}

function StudentComboboxControl({
  field,
  maximum,
  options,
  submitted,
}: {
  field: FormFieldApi<string[]>;
  maximum: number;
  options: readonly StudentComboboxOption[];
  submitted: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const anchorRef = useComboboxAnchor();
  const studentMap = new Map(
    options.map(({ student }) => [student.id, student])
  );
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter(({ student }) =>
        [student.humanId, student.name, student.ageCategory.name]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      )
    : options;
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
              : "Search Students..."
          }
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchorRef}>
        <ComboboxList>
          {filteredOptions.map(({ disabledReason, student }) => (
            <ComboboxItem
              disabled={disabledReason !== null}
              key={student.id}
              value={student.id}
            >
              <div className="min-w-0">
                <div>
                  {student.humanId} · {student.name} ·{" "}
                  {student.ageCategory.name}
                </div>
                {disabledReason ? (
                  <div className="text-muted-foreground">{disabledReason}</div>
                ) : null}
              </div>
            </ComboboxItem>
          ))}
          {filteredOptions.length === 0 ? (
            <div className="py-2 text-center text-muted-foreground text-xs">
              No matching Students found.
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
    for (const issue of getEntryValidationIssues({
      entries,
      entry,
      fixedSession,
      sessionId: value.sessionId,
      sessions,
      studentIds: value.studentIds,
      studentMap,
    })) {
      context.addIssue({
        code: "custom",
        message: issue.message,
        path: [issue.path],
      });
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
        form.setFieldMeta("sessionId", (previous) => ({
          ...previous,
          errorMap: {
            ...previous.errorMap,
            onServer: { message: unavailableSessionMessage },
          },
        }));
        return;
      }
      const now = Date.now();
      if (entry) {
        await submitGroupEdit(entry, value.studentIds, now);
        return;
      }
      if (session.competition.participationMode === "group") {
        await submitGroup(value.sessionId, value.studentIds, now);
        return;
      }
      await submitIndividuals(value.sessionId, value.studentIds, now);
    },
    validators: { onChange: validationSchema, onSubmit: validationSchema },
  });

  function finishMutation(
    result: EntryMutationResult,
    meta: EntryMutationMeta
  ): void {
    const mutationErrorMessage = getMutationErrorMessage(result);
    if (mutationErrorMessage) {
      form.setFieldMeta("studentIds", (previous) => ({
        ...previous,
        errorMap: {
          ...previous.errorMap,
          onServer: { message: mutationErrorMessage },
        },
      }));
    }
    handleMutationResult(result, {
      ...meta,
      errorMsg: mutationErrorMessage ?? meta.errorMsg,
    });
    if (result.type !== "error") {
      onOpenChange(false);
    }
  }

  async function submitGroupEdit(
    currentEntry: KalakritiEntryRow,
    studentIds: string[],
    now: number
  ): Promise<void> {
    const result = await zero.mutate(
      mutators.kalakritiEntry.replaceGroupMembers({
        auditEntryId: uuidv7(),
        entryId: currentEntry.id,
        members: studentIds.map((studentId) => ({
          memberId: uuidv7(),
          studentId,
        })),
        now,
      })
    ).server;
    finishMutation(result, {
      entityId: currentEntry.id,
      errorMsg: "Failed to update Competition group",
      mutation: "kalakritiEntry.replaceGroupMembers",
      successMsg: "Competition group updated",
    });
  }

  async function submitGroup(
    sessionId: string,
    studentIds: string[],
    now: number
  ): Promise<void> {
    const result = await zero.mutate(
      mutators.kalakritiEntry.createGroup({
        auditEntryId: uuidv7(),
        centerId,
        divisionId: sessionId,
        editionId,
        entryId: uuidv7(),
        members: studentIds.map((studentId) => ({
          memberId: uuidv7(),
          studentId,
        })),
        now,
      })
    ).server;
    finishMutation(result, {
      entityId: sessionId,
      errorMsg: "Failed to register Competition group",
      mutation: "kalakritiEntry.createGroup",
      successMsg: "Competition group registered",
    });
  }

  async function submitIndividuals(
    sessionId: string,
    studentIds: string[],
    now: number
  ): Promise<void> {
    const results = await Promise.all(
      studentIds.map(
        (studentId) =>
          zero.mutate(
            mutators.kalakritiEntry.createIndividual({
              auditEntryId: uuidv7(),
              centerId,
              divisionId: sessionId,
              editionId,
              entryId: uuidv7(),
              memberId: uuidv7(),
              now,
              studentId,
            })
          ).server
      )
    );
    const failedResult = results.find((result) => result.type === "error");
    finishMutation(failedResult ?? { type: "complete" }, {
      entityId: studentIds.join(","),
      errorMsg: "Some Competition Entries could not be registered",
      mutation: "kalakritiEntry.createIndividual",
      successMsg:
        studentIds.length === 1
          ? "Competition Entry registered"
          : `${studentIds.length} Competition Entries registered`,
    });
  }

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
          const isGroup = session?.competition.participationMode === "group";
          const maximum = isGroup
            ? (session?.competition.maximumGroupSize ?? 1)
            : Math.max(
                1,
                (session?.capacity ?? 1) - (session?.entries.length ?? 0)
              );
          const options = session
            ? students.flatMap((student): StudentComboboxOption[] => {
                const eligibility = getEntryStudentOptionEligibility({
                  editingEntryId: entry?.id,
                  entries,
                  session,
                  student,
                });
                if (eligibility.status === "hidden") {
                  return [];
                }
                return [
                  {
                    disabledReason:
                      eligibility.status === "disabled"
                        ? eligibility.reason
                        : null,
                    student,
                  },
                ];
              })
            : [];
          return (
            <StudentCombobox
              description={
                isGroup
                  ? `Select ${session?.competition.minimumGroupSize ?? 1} to ${maximum} Students. Every member is checked against eligibility, limits, and schedule conflicts.`
                  : "Select one or more eligible Students for this Session."
              }
              label={isGroup ? "Group members" : "Students"}
              maximum={maximum}
              options={options}
            />
          );
        }}
      </form.Subscribe>
      <FormActions
        onCancel={handleCancel}
        submitLabel={getSubmitLabel(entry, fixedSession)}
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
          <DialogTitle>{getDialogTitle(props)}</DialogTitle>
          <DialogDescription>{getDialogDescription(props)}</DialogDescription>
        </DialogHeader>
        <EntryForm key={formKey} {...props} />
      </DialogContent>
    </Dialog>
  );
}
