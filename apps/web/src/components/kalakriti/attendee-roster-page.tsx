import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { canManageKalakritiAttendees } from "@/lib/kalakriti-attendee-policy";

import { AttendeeDetailSheet } from "./attendee-detail-sheet";
import { AttendeeFormDialog } from "./attendee-form-dialog";
import { type AttendeeRow, AttendeesTable } from "./attendees-table";
import { JudgeCompetitionsDialog } from "./judge-competitions-dialog";
import { KalakritiPageHeader } from "./kalakriti-page-header";

export function AttendeeRosterPage({
  access,
  kind,
}: {
  access: KalakritiEditionAccess;
  kind: "guest" | "judge";
}) {
  const zero = useZero();
  const editionId = access.edition.id;
  const canManage = canManageKalakritiAttendees(access);
  const [rows, result] = useQuery(
    queries.kalakritiAttendee.visible({ editionId, kind })
  );
  const scope = JSON.stringify([
    editionId,
    kind,
    access.edition.lifecycle,
    access.isGlobalAdmin,
    access.membership?.id,
    access.membership?.kind,
    access.membership?.assignments
      .map(
        (assignment) =>
          `${assignment.responsibility}:${assignment.competitionCategoryId ?? ""}:${assignment.competitionId ?? ""}:${assignment.centerId ?? ""}`
      )
      .sort(),
  ]);
  const [snapshot, setSnapshot] = useState<{
    scope: string;
    rows: AttendeeRow[];
  }>();
  useEffect(() => {
    if (result.type === "complete") setSnapshot({ scope, rows: [...rows] });
  }, [rows, result.type, scope]);
  const data =
    result.type === "complete"
      ? [...rows]
      : snapshot?.scope === scope
        ? snapshot.rows
        : [];
  const statusReady = result.type === "complete" || snapshot?.scope === scope;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [assignId, setAssignId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const selected = data.find((row) => row.id === selectedId) ?? null;
  const editing = data.find((row) => row.id === editId);
  const assigning = data.find((row) => row.id === assignId);
  const archive = useConfirmAction<AttendeeRow>({
    onConfirm: (row) =>
      zero.mutate(
        mutators.kalakritiAttendee.archive({
          id: row.id,
          editionId,
          now: Date.now(),
          auditEntryId: uuidv7(),
        })
      ).server,
    mutationMeta: {
      mutation: "kalakritiAttendee.archive",
      entityId: (row) => row.id,
      successMsg: "Attendee archived",
      errorMsg: "Attendee could not be archived",
    },
  });
  const onView = useEventCallback((row: AttendeeRow) => setSelectedId(row.id));
  const onEdit = useEventCallback((row: AttendeeRow) => {
    setSelectedId(null);
    setEditId(row.id);
  });
  const onAssign = useEventCallback((row: AttendeeRow) => {
    setSelectedId(null);
    setAssignId(row.id);
  });
  const onArchive = useEventCallback((row: AttendeeRow) => {
    setSelectedId(null);
    archive.trigger(row);
  });
  const label = kind === "guest" ? "Guest" : "Judge";
  return (
    <div className="space-y-4">
      <KalakritiPageHeader
        kicker={`Kalakriti · ${access.edition.year}`}
        title={`${label}s`}
      />
      <AttendeesTable
        data={data}
        kind={kind}
        canManage={canManage}
        isLoading={!data.length && result.type !== "complete"}
        statusReady={statusReady}
        onView={onView}
        onEdit={onEdit}
        onAssign={onAssign}
        onArchive={onArchive}
        toolbarActions={
          canManage ? (
            <Button onClick={() => setCreateOpen(true)}>Add {label}</Button>
          ) : null
        }
      />
      <AttendeeDetailSheet
        attendee={selected}
        canManage={canManage}
        statusReady={statusReady}
        onClose={() => setSelectedId(null)}
        onEdit={onEdit}
        onArchive={onArchive}
        onAssign={onAssign}
      />
      {canManage && (createOpen || editing) ? (
        <AttendeeFormDialog
          key={editing?.id ?? "new"}
          attendee={editing}
          editionId={editionId}
          kind={kind}
          onClose={() => {
            setCreateOpen(false);
            setEditId(null);
          }}
        />
      ) : null}
      {canManage && assigning ? (
        <JudgeCompetitionsDialog
          key={assigning.id}
          attendee={assigning}
          editionId={editionId}
          onClose={() => setAssignId(null)}
        />
      ) : null}
      <ConfirmDialog
        title={`Archive ${label}?`}
        description={`Remove ${archive.payload?.name ?? "this attendee"} from the active roster? Recorded event-day history is retained.`}
        confirmLabel="Archive"
        loading={archive.isLoading}
        loadingLabel="Archiving..."
        open={canManage && archive.isOpen}
        onConfirm={archive.confirm}
        onOpenChange={(open) => {
          if (!open) archive.cancel();
        }}
      />
    </div>
  );
}
