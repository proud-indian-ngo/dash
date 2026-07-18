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
import { FormLayout } from "@/components/form/form-layout";
import { SelectField } from "@/components/form/select-field";
import {
  getGroupEntryValidationErrors,
  getIndividualEntryValidationError,
} from "@/lib/kalakriti-entry-policy";
import { handleMutationResult } from "@/lib/mutation-result";
import { StudentPicker } from "./student-picker";

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

function sessionOptionLabel(session: KalakritiEntrySession): string {
  const remaining = Math.max(0, session.capacity - session.entries.length);
  return [
    session.competition.name,
    session.competition.participationMode === "group"
      ? `Group of ${session.competition.minimumGroupSize}–${session.competition.maximumGroupSize}`
      : "Individual",
    session.ageCategory.name,
    `${format(new Date(session.startAt), "dd MMM, h:mm a")}–${format(new Date(session.endAt), "h:mm a")}`,
    session.venue.name,
    `${remaining} ${remaining === 1 ? "place" : "places"} left`,
  ].join(" · ");
}

function EntryForm({
  centerId,
  editionId,
  entry,
  entries,
  onOpenChange,
  sessions,
  students,
}: Omit<EntryFormDialogProps, "open">) {
  const zero = useZero();
  const validationSchema = entryFormSchema.superRefine((value, context) => {
    const session = sessions.find(
      (candidate) => candidate.id === value.sessionId
    );
    if (!session) {
      return;
    }
    const selectedStudents = value.studentIds.flatMap((studentId) => {
      const student = students.find((candidate) => candidate.id === studentId);
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
    const [selectedStudent] = selectedStudents;
    const messages =
      session.competition.participationMode === "individual"
        ? [
            selectedStudents.length === 1 && selectedStudent
              ? getIndividualEntryValidationError({
                  entries,
                  session,
                  student: selectedStudent,
                })
              : "Choose exactly one Student for an individual Entry",
          ]
        : getGroupEntryValidationErrors({
            editingEntryId: entry?.id,
            entries,
            session,
            students: selectedStudents,
          });
    for (const message of messages) {
      if (message) {
        context.addIssue({ code: "custom", message, path: ["studentIds"] });
      }
    }
  });
  const form = useForm({
    defaultValues: {
      sessionId: entry?.sessionId ?? "",
      studentIds: entry?.members.map((member) => member.studentId) ?? [],
    },
    onSubmit: async ({ value }) => {
      const session = sessions.find(
        (candidate) => candidate.id === value.sessionId
      );
      if (!session) {
        return;
      }
      const members = value.studentIds.map((studentId) => ({
        memberId: uuidv7(),
        studentId,
      }));
      let result: { error?: unknown; type: string };
      let mutation: string;
      if (entry) {
        result = await zero.mutate(
          mutators.kalakritiEntry.replaceGroupMembers({
            auditEntryId: uuidv7(),
            entryId: entry.id,
            members,
            now: Date.now(),
          })
        ).server;
        mutation = "kalakritiEntry.replaceGroupMembers";
      } else if (session.competition.participationMode === "group") {
        const entryId = uuidv7();
        result = await zero.mutate(
          mutators.kalakritiEntry.createGroup({
            auditEntryId: uuidv7(),
            centerId,
            editionId,
            entryId,
            members,
            now: Date.now(),
            sessionId: value.sessionId,
          })
        ).server;
        mutation = "kalakritiEntry.createGroup";
      } else {
        const [member] = members;
        if (!member) {
          return;
        }
        result = await zero.mutate(
          mutators.kalakritiEntry.createIndividual({
            auditEntryId: uuidv7(),
            centerId,
            editionId,
            entryId: uuidv7(),
            memberId: member.memberId,
            now: Date.now(),
            sessionId: value.sessionId,
            studentId: member.studentId,
          })
        ).server;
        mutation = "kalakritiEntry.createIndividual";
      }
      handleMutationResult(result, {
        entityId: entry?.id ?? value.sessionId,
        errorMsg: entry
          ? "Failed to update Competition group"
          : "Failed to register Competition Entry",
        mutation,
        successMsg: entry
          ? "Competition group updated"
          : "Competition Entry registered",
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
      <SelectField
        description="Availability is rechecked when you submit, so a place cannot be overbooked."
        disabled={Boolean(entry)}
        isRequired
        label="Competition Session"
        name="sessionId"
        options={sessions.map((session) => ({
          label: sessionOptionLabel(session),
          value: session.id,
        }))}
        placeholder="Choose Session"
      />
      <form.Subscribe selector={selectSessionId}>
        {(sessionId) => {
          const session = sessions.find(
            (candidate) => candidate.id === sessionId
          );
          const maximum =
            session?.competition.participationMode === "group"
              ? session.competition.maximumGroupSize
              : 1;
          return (
            <CustomField<string[]>
              controlId="entry-students"
              description={
                session?.competition.participationMode === "group"
                  ? `Select ${session.competition.minimumGroupSize} to ${maximum} Students. Every member is checked against eligibility, limits, and schedule conflicts.`
                  : "Select the Student who will participate in this Session."
              }
              isRequired
              label={
                session?.competition.participationMode === "group"
                  ? "Group members"
                  : "Student"
              }
              name="studentIds"
            >
              {(field) => (
                <StudentPicker
                  inputId="entry-students"
                  maximum={maximum}
                  onBlur={field.handleBlur}
                  onValueChange={field.handleChange}
                  students={students}
                  value={field.state.value ?? []}
                />
              )}
            </CustomField>
          );
        }}
      </form.Subscribe>
      <FormActions
        onCancel={handleCancel}
        submitLabel={entry ? "Save Group" : "Register Entry"}
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
              : "Register Competition Entry"}
          </DialogTitle>
          <DialogDescription>
            {props.entry
              ? "Update the Students in this group. The existing group remains unchanged if validation fails."
              : "Choose an eligible Session, then select its Student or group members."}
          </DialogDescription>
        </DialogHeader>
        <EntryForm key={formKey} {...props} />
      </DialogContent>
    </Dialog>
  );
}
