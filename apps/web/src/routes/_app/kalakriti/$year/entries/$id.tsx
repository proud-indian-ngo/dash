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
import { type ReactNode, useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";

import {
  EntryFormDialog,
  type KalakritiEntryRow,
  type KalakritiEntrySession,
  type KalakritiEntryStudent,
} from "@/components/kalakriti/entry-form-dialog";
import { EntryTable } from "@/components/kalakriti/entry-table";
import {
  buildKalakritiEntryRows,
  buildKalakritiEntrySessions,
} from "@/components/kalakriti/entry-view";
import { KalakritiLockNotice } from "@/components/kalakriti/kalakriti-lock-notice";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { Loader } from "@/components/loader";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { KALAKRITI_GENDER_ELIGIBILITY_LABELS } from "@/lib/kalakriti-competition-labels";
import {
  canRemoveKalakritiEntries,
  canWriteKalakritiEntries,
  type EntryRegistrationAvailability,
  getEntryRegistrationAvailability,
  getEntryStudentOptionEligibility,
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
      <div className="space-y-3" role="alert">
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
      <div className="space-y-2">
        <KalakritiPageHeader title="Session Entries" />
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

function countVisibleStudentOptions({
  editingEntryId,
  entries,
  session,
  students,
}: {
  editingEntryId?: string;
  entries: readonly KalakritiEntryRow[];
  session?: KalakritiEntrySession;
  students: readonly KalakritiEntryStudent[];
}): number {
  if (!session) {
    return 0;
  }
  return students.filter(
    (student) =>
      getEntryStudentOptionEligibility({
        editingEntryId,
        entries,
        session,
        student,
      }).status !== "hidden"
  ).length;
}

function SessionSummary({
  actions,
  centerName,
  participantCount,
  session,
}: {
  actions?: ReactNode;
  centerName?: string;
  participantCount: number;
  session?: KalakritiEntrySession;
}) {
  return (
    <KalakritiPageHeader
      actions={actions}
      kicker={session?.competition.category.name ?? "Session"}
      meta={
        <>
          <p>
            {participantCount} {participantCount === 1 ? "Student" : "Students"}{" "}
            registered for {centerName}.
          </p>
          {session ? (
            <p className="mt-1">
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
        </>
      }
      title={session?.competition.name ?? "Loading Session"}
    />
  );
}

function getSessionEntryPermissions({
  access,
  centerEnabled,
  lifecycle,
  registrationOpen,
}: {
  access: Parameters<typeof canWriteKalakritiEntries>[0];
  centerEnabled: boolean;
  lifecycle: string;
  registrationOpen: boolean;
}) {
  const canWriteEntries = canWriteKalakritiEntries(access);
  const removalEnabled =
    canWriteEntries &&
    canRemoveKalakritiEntries({
      centerEnabled,
      lifecycle,
    });
  return {
    canWriteEntries,
    edit: removalEnabled,
    register: canWriteEntries && registrationOpen,
    remove: removalEnabled,
    uploadMusic: canWriteEntries && registrationOpen,
  };
}

function sessionAllowsMusic(session?: KalakritiEntrySession): boolean {
  return session?.competition.musicUploadEnabled === true;
}

function renderSessionEntryForm({
  canWrite,
  centerId,
  completeEntries,
  completeStudents,
  createOpen,
  editingEntry,
  editionId,
  onOpenChange,
  session,
}: {
  canWrite: boolean;
  centerId: string | null;
  completeEntries: readonly KalakritiEntryRow[];
  completeStudents: readonly KalakritiEntryStudent[];
  createOpen: boolean;
  editingEntry: KalakritiEntryRow | null;
  editionId: string;
  onOpenChange: (open: boolean) => void;
  session?: KalakritiEntrySession;
}) {
  if (!(canWrite && centerId && session)) {
    return null;
  }
  return (
    <EntryFormDialog
      centerId={centerId}
      editionId={editionId}
      entries={completeEntries}
      entry={editingEntry ?? undefined}
      fixedSession={session}
      onOpenChange={onOpenChange}
      open={createOpen}
      sessions={[session]}
      students={completeStudents}
    />
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
    queries.kalakritiEntry.availableDivisionsByCenter(input),
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
  const completeSessions = buildKalakritiEntrySessions(sessions);
  const completeEntries = buildKalakritiEntryRows(entries, completeSessions);
  const completeStudents = students.filter(hasCompleteStudent);
  const session = completeSessions.find(
    (candidate) => candidate.id === sessionId
  );
  const sessionEntries = completeEntries.filter(
    (entry) => entry.sessionId === sessionId
  );
  const visibleStudentOptionCount = countVisibleStudentOptions({
    editingEntryId: editingEntry?.id,
    entries: completeEntries,
    session,
    students: completeStudents,
  });

  if (isSessionUnavailable(session, sessionsResult.type)) {
    return (
      <div className="space-y-4">
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
        <KalakritiPageHeader
          kicker="Entries"
          meta={<p>This Competition Session is no longer active.</p>}
          title="Session unavailable"
        />
      </div>
    );
  }

  const availability = getEntryRegistrationAvailability({
    centerEnabled: selectedCenter?.competitionEntryRegistrationEnabled === true,
    lifecycle: edition.lifecycle,
    referenceDataLoading,
    sessionCount: session ? 1 : 0,
    studentCount: visibleStudentOptionCount,
  });
  const registrationOpen = availability === "open";
  const permissions = getSessionEntryPermissions({
    access,
    centerEnabled: selectedCenter?.competitionEntryRegistrationEnabled === true,
    lifecycle: edition.lifecycle,
    registrationOpen,
  });
  return (
    <div className="space-y-6">
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
      <SessionSummary
        actions={
          <div className="min-w-52">
            <label
              className="mb-1 block text-sm font-medium"
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
        }
        centerName={selectedCenter?.name}
        participantCount={sessionEntries.reduce(
          (count, entry) => count + entry.members.length,
          0
        )}
        session={session}
      />
      {availability === "open" ? null : (
        <KalakritiLockNotice>
          {availabilityMessage(availability)}
        </KalakritiLockNotice>
      )}
      <EntryTable
        activeSessionIds={completeSessions.map(
          (activeSession) => activeSession.id
        )}
        centerId={centerId ?? ""}
        data={sessionEntries}
        editionId={edition.id}
        emptyMessage="No Entries have been registered for this Session."
        isLoading={entriesLoading}
        onEdit={handleEdit}
        onRegister={handleRegister}
        onRemove={removeAction.trigger}
        permissions={{
          edit: permissions.edit,
          register: permissions.register,
          remove: permissions.remove,
          uploadMusic: permissions.uploadMusic,
        }}
        showMusic={sessionAllowsMusic(session)}
        variant="session"
      />
      {renderSessionEntryForm({
        canWrite: permissions.canWriteEntries,
        centerId,
        completeEntries,
        completeStudents,
        createOpen,
        editingEntry,
        editionId: edition.id,
        onOpenChange: handleCreateOpenChange,
        session,
      })}
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
