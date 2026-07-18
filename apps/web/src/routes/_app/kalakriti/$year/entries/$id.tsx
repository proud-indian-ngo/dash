import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@pi-dash/design-system/components/ui/select";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import {
  EntryFormDialog,
  type KalakritiEntryRow,
  type KalakritiEntrySession,
  type KalakritiEntryStudent,
} from "@/components/kalakriti/entry-form-dialog";
import { EntryTable } from "@/components/kalakriti/entry-table";
import { Loader } from "@/components/loader";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { KALAKRITI_GENDER_ELIGIBILITY_LABELS } from "@/lib/kalakriti-competition-labels";
import {
  canRemoveKalakritiEntries,
  type EntryRegistrationAvailability,
  getEntryRegistrationAvailability,
  selectEligibleStudentsForSession,
  selectKalakritiEntryCenters,
} from "@/lib/kalakriti-entry-policy";

export const Route = createFileRoute("/_app/kalakriti/$year/entries/$id")({
  component: KalakritiSessionEntriesPage,
  validateSearch: z.object({ center: z.string().optional() }),
});

function retryFailedResult(result: { retry?: () => void; type: string }): void {
  if (result.type === "error") {
    result.retry?.();
  }
}

function availabilityMessage(
  availability: Exclude<EntryRegistrationAvailability, "open">
): string {
  const messages = {
    center_closed:
      "Competition Entry registration is closed for this Center. Existing Entries remain visible.",
    edition_closed:
      "Competition Entry registration is closed for this Edition. Existing Entries remain visible.",
    loading: "Checking Competition Entry registration availability...",
    missing_sessions: "This Session is no longer available.",
    missing_students:
      "No Students at this Center are eligible for this Session.",
  } satisfies Record<Exclude<EntryRegistrationAvailability, "open">, string>;
  return messages[availability];
}

function hasCompleteStudent<T extends { ageCategory?: unknown }>(
  student: T
): student is T & KalakritiEntryStudent {
  return Boolean(student.ageCategory);
}

function hasCompleteSession<
  T extends {
    ageCategory?: unknown;
    competition?: { category?: unknown };
    venue?: unknown;
  },
>(session: T): session is T & KalakritiEntrySession {
  return Boolean(
    session.ageCategory && session.competition?.category && session.venue
  );
}

function hasCompleteEntry<
  T extends {
    members: readonly { student?: { ageCategory?: unknown } }[];
    session?: {
      ageCategory?: unknown;
      competition?: { category?: unknown };
      venue?: unknown;
    };
  },
>(entry: T): entry is T & KalakritiEntryRow {
  return Boolean(
    entry.session &&
      hasCompleteSession(entry.session) &&
      entry.members.length > 0 &&
      entry.members.every(
        (member) => member.student && hasCompleteStudent(member.student)
      )
  );
}

function getInitialState({
  centerCount,
  centersLoading,
  onRetry,
  results,
}: {
  centerCount: number;
  centersLoading: boolean;
  onRetry: () => void;
  results: readonly { type: string }[];
}) {
  if (results.some((result) => result.type === "error")) {
    return (
      <div className="space-y-3 pt-6" role="alert">
        <p className="font-medium">Session Entries could not be loaded.</p>
        <p className="text-muted-foreground text-sm">
          Check your connection and try again.
        </p>
        <Button onClick={onRetry} variant="outline">
          Retry
        </Button>
      </div>
    );
  }
  if (centersLoading) {
    return (
      <div
        aria-label="Loading Centers"
        className="flex min-h-48 items-center justify-center"
        role="status"
      >
        <Loader />
      </div>
    );
  }
  if (centerCount === 0) {
    return (
      <div className="space-y-2 pt-6">
        <h2 className="font-display font-semibold text-2xl">Session Entries</h2>
        <p className="text-muted-foreground text-sm">
          You have not been assigned to a Center for Competition Entry
          registration.
        </p>
      </div>
    );
  }
  return null;
}

function getSelectedCenter<T extends { id: string }>(
  centers: readonly T[],
  selectedCenterId: string | undefined
): T | undefined {
  return centers.find((center) => center.id === selectedCenterId) ?? centers[0];
}

function isSessionUnavailable(
  session: KalakritiEntrySession | undefined,
  sessionsResultType: string
): boolean {
  return session === undefined && sessionsResultType === "complete";
}

function SessionSummary({
  centerName,
  participantCount,
  session,
}: {
  centerName?: string;
  participantCount: number;
  session?: KalakritiEntrySession;
}) {
  return (
    <div>
      <p className="font-medium text-muted-foreground text-sm">
        {session?.competition.category.name}
      </p>
      <h2 className="font-display font-semibold text-2xl">
        {session?.competition.name ?? "Loading Session"}
      </h2>
      <p className="mt-1 text-muted-foreground text-sm">
        {participantCount} {participantCount === 1 ? "Student" : "Students"}{" "}
        registered for {centerName}.
      </p>
      {session ? (
        <p className="mt-2 text-muted-foreground text-sm">
          {session.ageCategory.name} ·{" "}
          {
            KALAKRITI_GENDER_ELIGIBILITY_LABELS[
              session.competition.genderEligibility
            ]
          }{" "}
          · {format(new Date(session.startAt), "dd MMM, h:mm a")}–
          {format(new Date(session.endAt), "h:mm a")} · {session.venue.name}
        </p>
      ) : null}
    </div>
  );
}

function KalakritiSessionEntriesPage() {
  const zero = useZero();
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const { id: sessionId, year } = Route.useParams();
  const { center: selectedCenterId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KalakritiEntryRow | null>(
    null
  );
  const [centers, centersResult] = useQuery(
    queries.kalakritiCenter.visible({ editionId: edition.id })
  );
  const selectableCenters = selectKalakritiEntryCenters(centers, access);
  const selectedCenter = getSelectedCenter(selectableCenters, selectedCenterId);
  const centerId = selectedCenter?.id ?? null;
  const input = {
    centerId: centerId ?? "00000000-0000-0000-0000-000000000000",
    editionId: edition.id,
  };
  const [entries, entriesResult] = useQuery(
    queries.kalakritiEntry.visibleByCenter(input),
    { enabled: centerId !== null }
  );
  const [sessions, sessionsResult] = useQuery(
    queries.kalakritiEntry.availableSessionsByCenter(input),
    { enabled: centerId !== null }
  );
  const [students, studentsResult] = useQuery(
    queries.kalakritiStudent.visibleByCenter(input),
    { enabled: centerId !== null }
  );
  const removeAction = useConfirmAction<KalakritiEntryRow>({
    mutationMeta: {
      entityId: (entry) => entry.id,
      errorMsg: "Competition Entry could not be removed",
      mutation: "kalakritiEntry.remove",
      successMsg: "Competition Entry removed",
    },
    onConfirm: (entry) =>
      zero.mutate(
        mutators.kalakritiEntry.remove({
          auditEntryId: uuidv7(),
          entryId: entry.id,
          now: Date.now(),
        })
      ).server,
  });
  const handleCenterChange = useEventCallback((value: string | null) => {
    navigate({
      replace: true,
      search: { center: value ?? undefined },
    });
  });
  const handleCreateOpenChange = useEventCallback((open: boolean) => {
    setCreateOpen(open);
    if (!open) {
      setEditingEntry(null);
    }
  });
  const handleRegister = useEventCallback(() => {
    setEditingEntry(null);
    setCreateOpen(true);
  });
  const handleEdit = useEventCallback((entry: KalakritiEntryRow) => {
    setEditingEntry(entry);
    setCreateOpen(true);
  });
  const handleRemoveOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      removeAction.cancel();
    }
  });
  const retry = useEventCallback(() => {
    retryFailedResult(centersResult);
    retryFailedResult(entriesResult);
    retryFailedResult(sessionsResult);
    retryFailedResult(studentsResult);
  });

  const centersLoading =
    centers.length === 0 && centersResult.type !== "complete";
  const initialState = getInitialState({
    centerCount: selectableCenters.length,
    centersLoading,
    onRetry: retry,
    results: [centersResult, entriesResult, sessionsResult, studentsResult],
  });
  if (initialState) {
    return initialState;
  }

  const entriesLoading =
    centerId !== null &&
    entries.length === 0 &&
    entriesResult.type !== "complete";
  const referenceDataLoading =
    centerId !== null &&
    ((sessions.length === 0 && sessionsResult.type !== "complete") ||
      (students.length === 0 && studentsResult.type !== "complete"));
  const completeEntries = entries.filter(hasCompleteEntry);
  const completeSessions = sessions.filter(hasCompleteSession);
  const completeStudents = students.filter(hasCompleteStudent);
  const session = completeSessions.find(
    (candidate) => candidate.id === sessionId
  );
  const sessionEntries = completeEntries.filter(
    (entry) => entry.sessionId === sessionId
  );
  const eligibleStudents = session
    ? selectEligibleStudentsForSession({
        editingEntryId: editingEntry?.id,
        entries: completeEntries,
        session,
        students: completeStudents,
      })
    : [];

  if (isSessionUnavailable(session, sessionsResult.type)) {
    return (
      <div className="space-y-4 pt-6">
        <Button
          nativeButton={false}
          render={
            <Link
              params={{ year }}
              search={{ center: centerId ?? undefined }}
              to="/kalakriti/$year/entries"
            />
          }
          variant="ghost"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          Back to Sessions
        </Button>
        <div>
          <h2 className="font-display font-semibold text-2xl">
            Session unavailable
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            This Competition Session is no longer active.
          </p>
        </div>
      </div>
    );
  }

  const availability = getEntryRegistrationAvailability({
    centerEnabled: selectedCenter?.competitionEntryRegistrationEnabled === true,
    lifecycle: edition.lifecycle,
    referenceDataLoading,
    sessionCount: session ? 1 : 0,
    studentCount: eligibleStudents.length,
  });
  const registrationOpen = availability === "open";
  const removalEnabled = canRemoveKalakritiEntries({
    centerEnabled: selectedCenter?.competitionEntryRegistrationEnabled === true,
    lifecycle: edition.lifecycle,
  });
  return (
    <div className="space-y-6 pt-6">
      <Button
        nativeButton={false}
        render={
          <Link
            params={{ year }}
            search={{ center: centerId ?? undefined }}
            to="/kalakriti/$year/entries"
          />
        }
        variant="ghost"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        Back to Sessions
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SessionSummary
          centerName={selectedCenter?.name}
          participantCount={sessionEntries.reduce(
            (count, entry) => count + entry.members.length,
            0
          )}
          session={session}
        />
        <div className="min-w-52">
          <label
            className="mb-1 block font-medium text-sm"
            htmlFor="entry-center"
          >
            Center
          </label>
          <Select onValueChange={handleCenterChange} value={centerId ?? ""}>
            <SelectTrigger id="entry-center">
              <span data-slot="select-value">
                {selectedCenter?.name ?? "Choose Center"}
              </span>
            </SelectTrigger>
            <SelectContent>
              {selectableCenters.map((center) => (
                <SelectItem key={center.id} value={center.id}>
                  {center.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {availability === "open" ? null : (
        <p className="border border-dashed p-3 text-muted-foreground text-sm">
          {availabilityMessage(availability)}
        </p>
      )}
      <EntryTable
        canEdit={removalEnabled}
        canRegister={registrationOpen}
        canRemove={removalEnabled}
        data={sessionEntries}
        emptyMessage="No Entries have been registered for this Session."
        hideCompetition
        isLoading={entriesLoading}
        onEdit={handleEdit}
        onRegister={handleRegister}
        onRemove={removeAction.trigger}
      />
      {centerId && session ? (
        <EntryFormDialog
          centerId={centerId}
          editionId={edition.id}
          entries={completeEntries}
          entry={editingEntry ?? undefined}
          fixedSession={session}
          onOpenChange={handleCreateOpenChange}
          open={createOpen}
          sessions={[session]}
          students={eligibleStudents}
        />
      ) : null}
      <ConfirmDialog
        confirmLabel="Remove Entry"
        description={
          removeAction.payload?.participationMode === "group"
            ? `This removes the group and all ${removeAction.payload.members.length} Students from this Competition Session.`
            : "This removes the Student from this Competition Session."
        }
        loading={removeAction.isLoading}
        onConfirm={removeAction.confirm}
        onOpenChange={handleRemoveOpenChange}
        open={removeAction.isOpen}
        title="Remove Competition Entry?"
        variant="destructive"
      />
    </div>
  );
}
