import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { getEntryStudentArrival } from "@/components/kalakriti/entry-arrival";
import {
  EntryFormDialog,
  type KalakritiEntryRow,
  type KalakritiEntryStudent,
} from "@/components/kalakriti/entry-form-dialog";
import {
  getSessionEntryPermissions,
  selectWritableEntryCenters,
} from "@/components/kalakriti/entry-permissions";
import { EntryTable } from "@/components/kalakriti/entry-table";
import {
  buildKalakritiEntryRows,
  buildKalakritiEntrySessions,
} from "@/components/kalakriti/entry-view";
import { KalakritiLockNotice } from "@/components/kalakriti/kalakriti-lock-notice";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { useTransportStatusSnapshot } from "@/components/kalakriti/use-transport-status-snapshot";
import { Loader } from "@/components/loader";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { getEntryStudentOptionEligibility } from "@/lib/kalakriti-entry-policy";
export const Route = createFileRoute("/_app/kalakriti/$year/entries/$id")({
  component: KalakritiSessionEntriesPage,
  validateSearch: z.object({ center: z.string().optional() }),
});
function completeStudent<T extends { ageCategory?: unknown }>(
  student: T
): student is T & KalakritiEntryStudent {
  return Boolean(student.ageCategory);
}
function KalakritiSessionEntriesPage() {
  const zero = useZero();
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const { id: sessionId, year } = Route.useParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KalakritiEntryRow | null>(
    null
  );
  const [centers, centersResult] = useQuery(
    queries.kalakritiCenter.visible({ editionId: edition.id })
  );
  const [entries, entriesResult] = useQuery(
    queries.kalakritiEntry.visible({ editionId: edition.id })
  );
  const [sessions, sessionsResult] = useQuery(
    queries.kalakritiEntry.availableDivisions({ editionId: edition.id })
  );
  const [students, studentsResult] = useQuery(
    queries.kalakritiStudent.visibleForEntries({ editionId: edition.id })
  );
  const baseResults = [
    centersResult,
    entriesResult,
    sessionsResult,
    studentsResult,
  ];
  const snapshotReady = baseResults.every(
    (result) => result.type === "complete"
  );
  const completeSessions = buildKalakritiEntrySessions(sessions);
  const completeEntries = buildKalakritiEntryRows(entries, completeSessions);
  const studentRows = useMemo(
    () => students.filter(completeStudent),
    [students]
  );
  const studentArrival = useTransportStatusSnapshot({
    data: studentRows,
    scopeKey: edition.id,
    complete: snapshotReady,
    getStatus: getEntryStudentArrival,
  });
  const completeStudents = studentRows.map((student) => ({
    ...student,
    arrivalStatus: studentArrival.labels?.get(student.id) ?? "Checking arrival",
  }));
  const session =
    completeSessions.find((candidate) => candidate.id === sessionId) ??
    completeEntries.find((entry) => entry.sessionId === sessionId)?.session;
  const [divisionEntries, divisionEntriesResult] = useQuery(
    queries.kalakritiEntry.visibleByDivision({
      editionId: edition.id,
      divisionId: sessionId,
      sessionId:
        session?.competitionSessionId ?? "00000000-0000-0000-0000-000000000000",
    }),
    { enabled: Boolean(session?.competitionSessionId) }
  );
  const results = [...baseResults, divisionEntriesResult];
  const sessionEntries = buildKalakritiEntryRows(
    divisionEntries,
    completeSessions
  );
  const writableCenters = selectWritableEntryCenters(centers, access);
  const registrationCenters = writableCenters.filter(
    (center) =>
      center.competitionEntryRegistrationEnabled &&
      completeStudents.some(
        (student) =>
          student.centerId === center.id &&
          session &&
          getEntryStudentOptionEligibility({
            entries: completeEntries,
            session,
            student,
          }).status !== "hidden"
      )
  );
  const registrationEligible =
    edition.lifecycle === "registration_open" &&
    registrationCenters.length > 0 &&
    completeSessions.some((candidate) => candidate.id === sessionId);
  const canRegister = snapshotReady && registrationEligible;
  const permissionsFor = useEventCallback((entry: KalakritiEntryRow) => {
    const center = writableCenters.find(
      (candidate) => candidate.id === entry.centerId
    );
    const permissions = getSessionEntryPermissions({
      access,
      centerEnabled: center?.competitionEntryRegistrationEnabled === true,
      lifecycle: edition.lifecycle,
      registrationOpen: canRegister,
    });
    return {
      edit: Boolean(center) && permissions.edit,
      remove: Boolean(center) && permissions.remove,
      uploadMusic: Boolean(center) && permissions.uploadMusic,
      register: canRegister,
    };
  });
  const removeAction = useConfirmAction<KalakritiEntryRow>({
    mutationMeta: {
      entityId: (entry) => entry.id,
      mutation: "kalakritiEntry.remove",
      successMsg: "Competition Entry removed",
      errorMsg: "Competition Entry could not be removed",
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
  const closeForm = useEventCallback((open: boolean) => {
    setCreateOpen(open);
    if (!open) setEditingEntry(null);
  });
  const register = useEventCallback(() => {
    if (canRegister) {
      setEditingEntry(null);
      setCreateOpen(true);
    }
  });
  const edit = useEventCallback((entry: KalakritiEntryRow) => {
    if (permissionsFor(entry).edit) {
      setEditingEntry(entry);
      setCreateOpen(true);
    }
  });
  const retry = useEventCallback(() => {
    for (const result of results) if (result.type === "error") result.retry?.();
  });
  if (results.some((result) => result.type === "error"))
    return (
      <div role="alert">
        <p>Session Entries could not be loaded.</p>
        <Button onClick={retry}>Retry</Button>
      </div>
    );
  if (
    !session &&
    (sessionsResult.type !== "complete" || entriesResult.type !== "complete")
  )
    return <Loader />;
  const participants = [
    ...new Map(
      sessionEntries.flatMap((entry) =>
        entry.members.map(
          (member) => [member.studentId, member.student] as const
        )
      )
    ).values(),
  ];
  return (
    <div className="space-y-6">
      <Button
        nativeButton={false}
        render={
          <Link params={{ year }} search={{}} to="/kalakriti/$year/entries" />
        }
        variant="ghost"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        Back to Sessions
      </Button>
      <KalakritiPageHeader
        title={session?.competition.name ?? "Session unavailable"}
        kicker={session?.competition.category.name ?? "Entries"}
        meta={
          session ? (
            <>
              <p>
                {snapshotReady && divisionEntriesResult.type === "complete"
                  ? participants.length
                  : "Checking"}{" "}
                Students registered across authorized Centers.{" "}
              </p>
              <p>
                {session.ageCategory.name} ·{" "}
                {format(new Date(session.startAt), "dd MMM, h:mm a")}–
                {format(new Date(session.endAt), "h:mm a")} ·{" "}
                {session.venue.name}
              </p>
            </>
          ) : (
            <p>
              This Competition Session is no longer available to your account.
            </p>
          )
        }
      />
      {session ? (
        <>
          {!canRegister ? (
            <KalakritiLockNotice>
              {!snapshotReady
                ? "Checking Competition Entry registration availability..."
                : "Registration is unavailable for this Session or your authorized Centers. Existing Entries remain visible."}
            </KalakritiLockNotice>
          ) : null}
          <EntryTable
            activeSessionIds={completeSessions.map((item) => item.id)}
            data={sessionEntries}
            editionId={edition.id}
            emptyMessage="No Entries have been registered for this Session."
            isLoading={
              divisionEntries.length === 0 &&
              divisionEntriesResult.type !== "complete"
            }
            snapshotReady={
              snapshotReady && divisionEntriesResult.type === "complete"
            }
            onEdit={edit}
            onRegister={register}
            onRemove={removeAction.trigger}
            permissions={{
              register: canRegister,
              edit: sessionEntries.some((entry) => permissionsFor(entry).edit),
              remove: sessionEntries.some(
                (entry) => permissionsFor(entry).remove
              ),
              uploadMusic: sessionEntries.some(
                (entry) => permissionsFor(entry).uploadMusic
              ),
            }}
            getRowPermissions={permissionsFor}
            showMusic={session.competition.musicUploadEnabled === true}
            variant="session"
          />
          {createOpen &&
          (editingEntry
            ? permissionsFor(editingEntry).edit
            : registrationEligible) ? (
            <EntryFormDialog
              editionId={edition.id}
              centers={editingEntry ? writableCenters : registrationCenters}
              entry={editingEntry ?? undefined}
              entries={completeEntries}
              fixedSession={session}
              sessions={[session]}
              students={completeStudents}
              open={true}
              onOpenChange={closeForm}
            />
          ) : null}
        </>
      ) : null}
      <ConfirmDialog
        confirmDisabled={
          !removeAction.payload || !permissionsFor(removeAction.payload).remove
        }
        title="Remove Competition Entry?"
        description={
          removeAction.payload?.participationMode === "group"
            ? `This removes the group and all ${removeAction.payload.members.length} Students from this Competition Session.`
            : "This removes the Student from this Competition Session."
        }
        confirmLabel="Remove Entry"
        open={removeAction.isOpen}
        loading={removeAction.isLoading}
        onConfirm={removeAction.confirm}
        onOpenChange={(open) => {
          if (!open) removeAction.cancel();
        }}
        variant="destructive"
      />
    </div>
  );
}
