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
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
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
import {
  canAccessKalakritiEntries,
  type EntryRegistrationAvailability,
  getEntryRegistrationAvailability,
  selectKalakritiEntryCenters,
} from "@/lib/kalakriti-entry-policy";

export const Route = createFileRoute("/_app/kalakriti/$year/entries")({
  beforeLoad: ({ context }) => {
    if (!canAccessKalakritiEntries(context.kalakritiEditionAccess)) {
      throw notFound();
    }
  },
  component: KalakritiEntriesPage,
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
    missing_sessions:
      "No active individual Competition Sessions are available. Ask an Events Lead to configure the schedule.",
    missing_students:
      "Register at least one Student for this Center before creating a Competition Entry.",
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

function KalakritiEntriesPage() {
  const zero = useZero();
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const [centers, centersResult] = useQuery(
    queries.kalakritiCenter.visible({ editionId: edition.id })
  );
  const selectableCenters = selectKalakritiEntryCenters(centers, access);
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const centerId = selectableCenters.some(
    (center) => center.id === selectedCenterId
  )
    ? selectedCenterId
    : (selectableCenters[0]?.id ?? null);
  const selectedCenter = selectableCenters.find(
    (center) => center.id === centerId
  );
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
  const handleCenterChange = useEventCallback((value: string | null) =>
    setSelectedCenterId(value)
  );
  const handleCreateOpenChange = useEventCallback(setCreateOpen);
  const handleRegister = useEventCallback(() => setCreateOpen(true));
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

  if (
    [centersResult, entriesResult, sessionsResult, studentsResult].some(
      (result) => result.type === "error"
    )
  ) {
    return (
      <div className="space-y-3 pt-6" role="alert">
        <p className="font-medium">Competition Entries could not be loaded.</p>
        <p className="text-muted-foreground text-sm">
          Check your connection and try again.
        </p>
        <Button onClick={retry} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  const centersLoading =
    centers.length === 0 && centersResult.type !== "complete";
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
  if (selectableCenters.length === 0) {
    return (
      <div className="space-y-2 pt-6">
        <h2 className="font-display font-semibold text-2xl">
          Competition Entries
        </h2>
        <p className="text-muted-foreground text-sm">
          You have not been assigned to a Center for Competition Entry
          registration.
        </p>
      </div>
    );
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
  const availability = getEntryRegistrationAvailability({
    centerEnabled: selectedCenter?.competitionEntryRegistrationEnabled === true,
    lifecycle: edition.lifecycle,
    referenceDataLoading,
    sessionCount: completeSessions.length,
    studentCount: completeStudents.length,
  });
  const registrationOpen = availability === "open";

  return (
    <div className="space-y-6 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display font-semibold text-2xl">
            Competition Entries
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            Register Students in individual Competition Sessions for one Center
            at a time.
          </p>
        </div>
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
        canManage={registrationOpen}
        data={completeEntries}
        isLoading={entriesLoading}
        onRegister={handleRegister}
        onRemove={removeAction.trigger}
      />
      {centerId ? (
        <EntryFormDialog
          centerId={centerId}
          editionId={edition.id}
          entries={completeEntries}
          onOpenChange={handleCreateOpenChange}
          open={createOpen}
          sessions={completeSessions}
          students={completeStudents}
        />
      ) : null}
      <ConfirmDialog
        confirmLabel="Remove Entry"
        description="This removes the Student from this Competition Session."
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
