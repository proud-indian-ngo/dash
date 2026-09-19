import { ArrowLeft01Icon, QrCodeScanIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { uuidv7 } from "uuidv7";

import { getEntryStudentArrival } from "@/components/kalakriti/entry-arrival";
import {
  EntryFormDialog,
  type KalakritiEntryRow,
  type KalakritiEntryStudent,
} from "@/components/kalakriti/entry-form-dialog";
import { orderSequentialKalakritiEntries } from "@/components/kalakriti/entry-performance-order";
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
import { ResultSection } from "@/components/kalakriti/result-section";
import { ScanDialog } from "@/components/kalakriti/scan-dialog";
import { useResultSnapshot } from "@/components/kalakriti/use-result-snapshot";
import { useTransportStatusSnapshot } from "@/components/kalakriti/use-transport-status-snapshot";
import { Loader } from "@/components/loader";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { getKalakritiNextSlots } from "@/functions/kalakriti-performance-order";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import {
  getEntryStudentOptionEligibility,
  indexEntriesByStudent,
} from "@/lib/kalakriti-entry-policy";
import { canScanKalakritiCompetition } from "@/lib/kalakriti-event-day-policy";
function completeStudent<T extends { ageCategory?: unknown }>(
  student: T
): student is T & KalakritiEntryStudent {
  return Boolean(student.ageCategory);
}
export function CompetitionEntries({
  access,
  divisionId: sessionId,
  year,
  center,
  onBack,
}: {
  access: KalakritiEditionAccess;
  divisionId: string;
  year: string;
  center?: string;
  onBack: () => void;
}) {
  const zero = useZero();
  const { edition } = access;
  const [createOpen, setCreateOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
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
  const sequential = session?.competition.sequentialPerformances === true;
  const nextSlots = useResultSnapshot(
    `${edition.id}:${sessionId}`,
    () =>
      getKalakritiNextSlots({
        data: { divisionId: sessionId, year: Number(year) },
      }),
    sequential
  );
  const results = [...baseResults, divisionEntriesResult];
  const sessionEntries = buildKalakritiEntryRows(
    divisionEntries,
    completeSessions
  );
  const orderedSession =
    sequential && nextSlots.data && session
      ? orderSequentialKalakritiEntries(
          sessionEntries,
          session.endAt,
          nextSlots.data
        )
      : {
          entries: sessionEntries,
          nextByEntryId: sequential ? new Map() : undefined,
        };
  const writableCenters = selectWritableEntryCenters(centers, access);
  const entriesByStudent = indexEntriesByStudent(completeEntries);
  const registrationCenters = writableCenters.filter(
    (center) =>
      center.competitionEntryRegistrationEnabled &&
      completeStudents.some(
        (student) =>
          student.centerId === center.id &&
          session &&
          getEntryStudentOptionEligibility({
            entries: entriesByStudent.get(student.id) ?? [],
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
  const scanAuthorized = Boolean(
    session &&
    canScanKalakritiCompetition(access, {
      competitionId: session.competition.id,
      competitionCategoryId: session.competition.competitionCategoryId,
    })
  );
  const canScan = Boolean(
    scanAuthorized &&
    edition.lifecycle === "live" &&
    session?.scheduleActive === true &&
    session?.competitionSessionId
  );
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
    <div className="flex flex-col gap-4">
      <Button onClick={onBack} type="button" variant="ghost">
        <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        Back to Competitions
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
                {session.competition.participationMode === "group"
                  ? "Group"
                  : "Individual"}{" "}
                · {format(new Date(session.startAt), "dd MMM, h:mm a")}–
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
                : edition.lifecycle !== "registration_open"
                  ? "Entry registration is closed for this Edition phase. Existing Entries remain visible."
                  : "No eligible Students in your writable Centers can register for this Session. Check Center registration settings and Student eligibility."}
            </KalakritiLockNotice>
          ) : null}
          <ResultSection divisionId={sessionId} year={Number(year)}>
            {(resultsAction) => (
              <EntryTable
                activeSessionIds={completeSessions.map((item) => item.id)}
                data={orderedSession.entries}
                nextByEntryId={orderedSession.nextByEntryId}
                editionId={edition.id}
                centerId={center}
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
                  edit: sessionEntries.some(
                    (entry) => permissionsFor(entry).edit
                  ),
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
                toolbarActions={
                  <>
                    {resultsAction}
                    {scanAuthorized ? (
                      <Button
                        disabled={!canScan}
                        onClick={() => setScanOpen(true)}
                        type="button"
                        variant="outline"
                      >
                        <HugeiconsIcon
                          data-icon="inline-start"
                          icon={QrCodeScanIcon}
                          strokeWidth={2}
                        />
                        Scan attendance
                      </Button>
                    ) : null}
                  </>
                }
              />
            )}
          </ResultSection>
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
          {scanOpen && canScan && session.competitionSessionId ? (
            <ScanDialog
              activities={["attendance"]}
              editionId={edition.id}
              fixedSessionId={session.competitionSessionId}
              initialActivity="attendance"
              onOpenChange={setScanOpen}
              year={edition.year}
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
