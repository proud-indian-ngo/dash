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
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { SelectField } from "@/components/form/select-field";
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
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sessions: readonly KalakritiEntrySession[];
  students: readonly KalakritiEntryStudent[];
}

const entryFormSchema = z.object({
  sessionId: z.string().min(1, "Choose a Competition Session"),
  studentId: z.string().min(1, "Choose a Student"),
});

function studentEntries(
  entries: readonly KalakritiEntryRow[],
  studentId: string
): KalakritiEntryRow[] {
  return entries.filter((entry) =>
    entry.members.some((member) => member.studentId === studentId)
  );
}

function sessionOptionLabel(session: KalakritiEntrySession): string {
  const remaining = Math.max(0, session.capacity - session.entries.length);
  return [
    session.competition.name,
    session.ageCategory.name,
    `${format(new Date(session.startAt), "dd MMM, h:mm a")}–${format(new Date(session.endAt), "h:mm a")}`,
    session.venue.name,
    `${remaining} ${remaining === 1 ? "place" : "places"} left`,
  ].join(" · ");
}

function entryValidationError({
  entries,
  session,
  student,
}: {
  entries: readonly KalakritiEntryRow[];
  session: KalakritiEntrySession;
  student: KalakritiEntryStudent;
}): string | null {
  const { competition } = session;
  if (competition.participationMode !== "individual") {
    return "Choose an individual Competition Session";
  }
  if (student.ageCategoryId !== session.ageCategoryId) {
    return `This Session is for ${session.ageCategory.name}`;
  }
  if (
    competition.genderEligibility !== "both" &&
    competition.genderEligibility !== student.gender
  ) {
    return `This Competition is limited to ${competition.genderEligibility} Students`;
  }
  if (session.entries.length >= session.capacity) {
    return "This Session is full. Choose another Session.";
  }
  const existing = studentEntries(entries, student.id);
  if (existing.some((entry) => entry.sessionId === session.id)) {
    return "This Student is already registered for this Session";
  }
  if (existing.length >= student.ageCategory.maxTotalCompetitions) {
    return "This Student has reached the total Competition limit";
  }
  const categoryEntries = existing.filter(
    (entry) =>
      entry.session.competition.competitionCategoryId ===
      competition.competitionCategoryId
  ).length;
  if (categoryEntries >= student.ageCategory.maxCompetitionsPerCategory) {
    return `This Student has reached the ${competition.category.name} limit`;
  }
  if (
    existing.some(
      (entry) =>
        entry.session.startAt < session.endAt &&
        entry.session.endAt > session.startAt
    )
  ) {
    return "This Session overlaps another Entry for this Student";
  }
  return null;
}

function EntryForm({
  centerId,
  editionId,
  entries,
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
    const message = entryValidationError({ entries, session, student });
    if (message) {
      context.addIssue({
        code: "custom",
        message,
        path: ["sessionId"],
      });
    }
  });
  const form = useForm({
    defaultValues: { sessionId: "", studentId: "" },
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
      <SelectField
        isRequired
        label="Student"
        name="studentId"
        options={students.map((student) => ({
          label: `${student.humanId} · ${student.name} · ${student.ageCategory.name}`,
          value: student.id,
        }))}
        placeholder="Choose Student"
      />
      <SelectField
        description="Availability is rechecked when you submit, so a place cannot be overbooked."
        isRequired
        label="Competition Session"
        name="sessionId"
        options={sessions.map((session) => ({
          label: sessionOptionLabel(session),
          value: session.id,
        }))}
        placeholder="Choose Session"
      />
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
            Choose one Student and an eligible individual Competition Session.
          </DialogDescription>
        </DialogHeader>
        <EntryForm key={formKey} {...props} />
      </DialogContent>
    </Dialog>
  );
}
