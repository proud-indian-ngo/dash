import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";
import { uuidv7 } from "uuidv7";

import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";
import { KalakritiLockNotice } from "@/components/kalakriti/kalakriti-lock-notice";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { StudentCenterChoice } from "@/components/kalakriti/student-center-choice";
import { StudentDetailSheet } from "@/components/kalakriti/student-detail-sheet";
import {
  type KalakritiStudentRow,
  StudentFormDialog,
} from "@/components/kalakriti/student-form-dialog";
import { StudentTable } from "@/components/kalakriti/student-table";
import { Loader } from "@/components/loader";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import {
  canDeleteDirectoryStudent,
  removeObsoleteStudentFilters,
  studentDirectoryPermissions,
  withStudentCenterFilter,
} from "@/lib/kalakriti-student-directory";
import {
  canAccessKalakritiStudents,
  selectKalakritiStudentCenters,
} from "@/lib/kalakriti-student-policy";

export const Route = createFileRoute("/_app/kalakriti/$year/students")({
  beforeLoad: ({ context }) => {
    if (!canAccessKalakritiStudents(context.kalakritiEditionAccess))
      throw notFound();
  },
  component: KalakritiStudentsPage,
});
const NO_CENTER = "00000000-0000-0000-0000-000000000000";
function KalakritiStudentsPage() {
  const zero = useZero();
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const [currentEdition, editionResult] = useQuery(
    queries.kalakritiEdition.byYear({ year: edition.year })
  );
  const [centers, centersResult] = useQuery(
    queries.kalakritiCenter.visible({ editionId: edition.id })
  );
  const selectableCenters = selectKalakritiStudentCenters(centers, access);
  const [students, studentsResult] = useQuery(
    queries.kalakritiStudent.visibleForDirectory({ editionId: edition.id })
  );
  const rows = useMemo(() => [...students], [students]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createAttempt, setCreateAttempt] = useState(0);
  const [createCenterId, setCreateCenterId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<
    (KalakritiStudentRow & { editionId: string }) | null
  >(null);
  const [editing, setEditing] = useState<
    (KalakritiStudentRow & { editionId: string }) | null
  >(null);
  useEffect(() => {
    setCreateOpen(false);
    setCreateCenterId(null);
    setViewing(null);
    setEditing(null);
  }, [edition.id]);
  useEffect(() => {
    if (
      editing &&
      studentsResult.type === "complete" &&
      !rows.some((row) => row.id === editing.id)
    )
      setEditing(null);
  }, [editing, rows, studentsResult.type]);
  const referenceCenterId =
    editing?.centerId ??
    (createOpen ? createCenterId : null) ??
    selectableCenters[0]?.id;
  const [ageCategories, categoriesResult] = useQuery(
    queries.kalakritiStudent.ageCategoriesByCenter({
      centerId: referenceCenterId ?? NO_CENTER,
      editionId: edition.id,
    }),
    { enabled: referenceCenterId !== undefined }
  );
  const lifecycle =
    currentEdition?.id === edition.id
      ? (currentEdition.lifecycle ?? "unknown")
      : "unknown";
  const referenceDataLoading = [
    centersResult,
    editionResult,
    categoriesResult,
    studentsResult,
  ].some((result) => result.type !== "complete");
  const permissions = useMemo(
    () =>
      studentDirectoryPermissions(
        selectableCenters,
        lifecycle,
        ageCategories.length,
        referenceDataLoading
      ),
    [selectableCenters, lifecycle, ageCategories.length, referenceDataLoading]
  );
  const writableCenters = selectableCenters.filter(
    (center) => permissions[center.id]?.canManage
  );
  const selectedCreateCenter = selectableCenters.find(
    (center) => center.id === createCenterId
  );

  const [linkedCenterId, setLinkedCenterId] = useQueryState(
    "centerId",
    parseAsString
  );
  const { query, setQuery } = useDataTableFilters();
  const normalizedQuery = useMemo(
    () => removeObsoleteStudentFilters(query),
    [query]
  );
  const needsFilterMigration =
    JSON.stringify(query) !== JSON.stringify(normalizedQuery);
  const consumedLink = useRef<string | null>(null);
  const linkedCenterAvailable = selectableCenters.some(
    (center) => center.id === linkedCenterId
  );
  useEffect(() => {
    if (linkedCenterId !== null) {
      if (centersResult.type !== "complete") return;
      if (linkedCenterAvailable) {
        if (consumedLink.current === linkedCenterId) return;
        consumedLink.current = linkedCenterId;
        // Commit one cleaned query with the Center rule before removing the
        // legacy parameter; normalization cannot overwrite an in-flight link.
        const migrateLink = async () => {
          await setQuery(
            withStudentCenterFilter(normalizedQuery, linkedCenterId, uuidv7())
          );
          await setLinkedCenterId(null);
        };
        void migrateLink();
        return;
      }
    } else consumedLink.current = null;
    if (needsFilterMigration) void setQuery(normalizedQuery);
  }, [
    linkedCenterId,
    linkedCenterAvailable,
    centersResult.type,
    normalizedQuery,
    needsFilterMigration,
    setQuery,
    setLinkedCenterId,
  ]);

  const deleteAction = useConfirmAction<KalakritiStudentRow>({
    mutationMeta: {
      entityId: (student) => student.id,
      errorMsg: "Student could not be deleted",
      mutation: "kalakritiStudent.delete",
      successMsg: "Student deleted",
    },
    onConfirm: async (student) => {
      const current = rows.find((row) => row.id === student.id);
      if (!current || !canDeleteDirectoryStudent(current, permissions))
        return {
          type: "error",
          error: {
            message:
              "Student registration is currently unavailable for this Center.",
          },
        };
      return zero.mutate(
        mutators.kalakritiStudent.delete({
          auditEntryId: uuidv7(),
          now: Date.now(),
          studentId: current.id,
        })
      ).server;
    },
  });
  const handleView = useEventCallback((student: KalakritiStudentRow) => {
    const current = rows.find((row) => row.id === student.id);
    if (current) setViewing(current);
  });
  const handleDetailOpenChange = useEventCallback((open: boolean) => {
    if (!open) setViewing(null);
  });
  const handleEdit = useEventCallback((student: KalakritiStudentRow) => {
    const current = rows.find((row) => row.id === student.id);
    if (current && permissions[current.centerId]?.canManage)
      setEditing(current);
  });
  const handleEditOpenChange = useEventCallback((open: boolean) => {
    if (!open) setEditing(null);
  });
  const handleRegister = useEventCallback(() => {
    if (writableCenters.length) {
      setCreateCenterId(null);
      setCreateAttempt((attempt) => attempt + 1);
      setCreateOpen(true);
    }
  });
  const handleCreateOpenChange = useEventCallback((open: boolean) =>
    setCreateOpen(open)
  );
  const handleChooseCenter = useEventCallback((id: string) => {
    if (permissions[id]?.canManage) setCreateCenterId(id);
  });
  const handleCancelCreate = useEventCallback(() => setCreateOpen(false));
  const handleDelete = useEventCallback((student: KalakritiStudentRow) => {
    if (canDeleteDirectoryStudent(student, permissions))
      deleteAction.trigger(student);
  });
  const handleDeleteOpenChange = useEventCallback((open: boolean) => {
    if (!open) deleteAction.cancel();
  });
  const retry = useEventCallback(() => {
    for (const result of [
      centersResult,
      studentsResult,
      categoriesResult,
      editionResult,
    ])
      if (result.type === "error") result.retry?.();
  });
  const viewingStudent =
    viewing?.editionId === edition.id
      ? (rows.find((row) => row.id === viewing.id) ??
        (studentsResult.type !== "complete" ? viewing : null))
      : null;
  const viewingCenter =
    viewingStudent?.center ??
    centers.find((center) => center.id === viewingStudent?.centerId);
  const editingExists = rows.some((row) => row.id === editing?.id);
  const editingCenter = centers.find(
    (center) => center.id === editing?.centerId
  );
  const isEditionAdmin =
    access.isGlobalAdmin ||
    access.membership?.responsibilities.includes("edition_admin") === true;

  if (
    [centersResult, studentsResult, categoriesResult, editionResult].some(
      (result) => result.type === "error"
    )
  )
    return (
      <div className="space-y-3" role="alert">
        <p>Students could not be loaded.</p>
        <Button onClick={retry} variant="outline">
          Retry
        </Button>
      </div>
    );
  if (
    needsFilterMigration ||
    (centers.length === 0 && centersResult.type !== "complete") ||
    (linkedCenterId !== null &&
      (centersResult.type !== "complete" || linkedCenterAvailable))
  )
    return (
      <div
        aria-label="Loading Students"
        className="flex min-h-48 items-center justify-center"
        role="status"
      >
        <Loader />
      </div>
    );
  if (
    linkedCenterId !== null &&
    centersResult.type === "complete" &&
    !linkedCenterAvailable
  )
    return (
      <div className="space-y-3">
        <KalakritiPageHeader
          kicker={`Kalakriti · ${edition.year}`}
          title="Students"
        />
        <p role="alert">
          The requested Center is unavailable or outside your access.
        </p>
        <Button onClick={() => void setLinkedCenterId(null)} variant="outline">
          Open Students directory
        </Button>
      </div>
    );
  return (
    <div className="space-y-6">
      <KalakritiPageHeader
        kicker={`Kalakriti · ${edition.year}`}
        title="Students"
      />
      {writableCenters.length === 0 ? (
        <KalakritiLockNotice>
          {selectableCenters.length === 0
            ? "You have not been assigned to a Center for student registration."
            : referenceDataLoading
              ? "Checking Student registration availability..."
              : lifecycle !== "registration_open"
                ? "Student registration is closed for this Edition. Existing registrations remain visible."
                : ageCategories.length === 0
                  ? "Student registration is not configured. Add an Age Category before registering Students."
                  : "Student registration is closed for your Centers. Existing registrations remain visible."}
        </KalakritiLockNotice>
      ) : null}
      <StudentTable
        canManage={writableCenters.length > 0}
        centerPermissions={permissions}
        centers={selectableCenters}
        data={rows}
        statusSnapshotComplete={studentsResult.type === "complete"}
        statusSnapshotKey={`${edition.id}:directory`}
        entryRegistrationEnabled={false}
        isLoading={rows.length === 0 && studentsResult.type !== "complete"}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onRegister={handleRegister}
        onView={handleView}
      />
      {viewingStudent && viewingCenter ? (
        <StudentDetailSheet
          access={access}
          center={viewingCenter}
          key={viewingStudent.id}
          onOpenChange={handleDetailOpenChange}
          open={true}
          student={viewingStudent}
        />
      ) : null}
      <StudentFormDialog
        ageCategories={[...ageCategories]}
        canOverrideAgeCategory={isEditionAdmin}
        canSubmit={Boolean(
          createCenterId && permissions[createCenterId]?.canManage
        )}
        centerId={createCenterId ?? ""}
        centerName={selectedCreateCenter?.name}
        editionId={edition.id}
        existingStudents={rows.filter((row) => row.centerId === createCenterId)}
        initialStep={
          !createCenterId ? (
            <StudentCenterChoice
              key={createAttempt}
              centers={writableCenters}
              onCancel={handleCancelCreate}
              onChoose={handleChooseCenter}
            />
          ) : undefined
        }
        onOpenChange={handleCreateOpenChange}
        open={createOpen}
      />
      {editing?.editionId === edition.id ? (
        <StudentFormDialog
          ageCategories={[...ageCategories]}
          canOverrideAgeCategory={isEditionAdmin}
          canSubmit={
            editingExists && permissions[editing.centerId]?.canManage === true
          }
          centerId={editing.centerId}
          centerName={editingCenter?.name ?? editing.center?.name}
          editionId={edition.id}
          existingStudents={rows.filter(
            (row) => row.centerId === editing.centerId
          )}
          onOpenChange={handleEditOpenChange}
          open={studentsResult.type !== "complete" || editingExists}
          student={editing}
        />
      ) : null}
      <ConfirmDialog
        confirmLabel="Delete Student"
        description={`Delete ${deleteAction.payload?.name ?? "this Student"}? This permanently removes the Student, their credential, and any Competition Entries.`}
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={handleDeleteOpenChange}
        open={
          deleteAction.isOpen &&
          !!deleteAction.payload &&
          canDeleteDirectoryStudent(deleteAction.payload, permissions)
        }
        title="Delete Student"
      />
    </div>
  );
}
