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
  type KalakritiStudentRow,
  StudentFormDialog,
} from "@/components/kalakriti/student-form-dialog";
import { StudentTable } from "@/components/kalakriti/student-table";
import { Loader } from "@/components/loader";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import {
  canAccessKalakritiStudents,
  getStudentRegistrationAvailability,
  type StudentRegistrationAvailability,
  selectKalakritiStudentCenters,
} from "@/lib/kalakriti-student-policy";

export const Route = createFileRoute("/_app/kalakriti/$year/students")({
  beforeLoad: ({ context }) => {
    const access = context.kalakritiEditionAccess;
    if (!canAccessKalakritiStudents(access)) {
      throw notFound();
    }
  },
  component: KalakritiStudentsPage,
});

function retryFailedResult(result: { retry?: () => void; type: string }): void {
  if (result.type === "error") {
    result.retry?.();
  }
}

function hasFailedResult(...results: { type: string }[]): boolean {
  return results.some((result) => result.type === "error");
}

function registrationAvailabilityMessage(
  availability: Exclude<StudentRegistrationAvailability, "open">
): string {
  const messages = {
    center_closed:
      "Student registration is closed for this Center. Existing registrations remain visible.",
    edition_closed:
      "Student registration is closed for this Edition. Existing registrations remain visible.",
    loading: "Checking Student registration availability...",
    missing_configuration:
      "Student registration is not configured for this Center. Add an Age Category quota before registering Students.",
  } satisfies Record<Exclude<StudentRegistrationAvailability, "open">, string>;
  return messages[availability];
}

function KalakritiStudentsPage() {
  const zero = useZero();
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const isEditionAdmin =
    access.isGlobalAdmin ||
    access.membership?.responsibilities.includes("edition_admin") === true;
  const [centers, centersResult] = useQuery(
    queries.kalakritiCenter.visible({ editionId: edition.id })
  );
  const selectableCenters = selectKalakritiStudentCenters(centers, access);
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingStudent, setEditingStudent] =
    useState<KalakritiStudentRow | null>(null);

  const centerId = selectableCenters.some(
    (center) => center.id === selectedCenterId
  )
    ? selectedCenterId
    : (selectableCenters[0]?.id ?? null);

  const selectedCenter = selectableCenters.find(
    (center) => center.id === centerId
  );
  const [students, studentsResult] = useQuery(
    queries.kalakritiStudent.visibleByCenter({
      centerId: centerId ?? "00000000-0000-0000-0000-000000000000",
      editionId: edition.id,
    }),
    { enabled: centerId !== null }
  );
  const registrationQueryInput = {
    centerId: centerId ?? "00000000-0000-0000-0000-000000000000",
    editionId: edition.id,
  };
  const [ageCategories, categoriesResult] = useQuery(
    queries.kalakritiStudent.ageCategoriesByCenter(registrationQueryInput),
    { enabled: centerId !== null }
  );
  const [registrationQuotas, quotasResult] = useQuery(
    queries.kalakritiStudent.quotasByCenter(registrationQueryInput),
    { enabled: centerId !== null }
  );
  const deleteAction = useConfirmAction<KalakritiStudentRow>({
    mutationMeta: {
      entityId: (student) => student.id,
      errorMsg: "Student could not be deleted",
      mutation: "kalakritiStudent.delete",
      successMsg: "Student deleted",
    },
    onConfirm: (student) =>
      zero.mutate(
        mutators.kalakritiStudent.delete({
          auditEntryId: uuidv7(),
          now: Date.now(),
          studentId: student.id,
        })
      ).server,
  });
  const handleCenterChange = useEventCallback((value: string | null) =>
    setSelectedCenterId(value)
  );
  const handleCreateOpenChange = useEventCallback((open: boolean) =>
    setCreateOpen(open)
  );
  const handleRegister = useEventCallback(() => setCreateOpen(true));
  const handleEditOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setEditingStudent(null);
    }
  });
  const handleEdit = useEventCallback((student: KalakritiStudentRow) =>
    setEditingStudent(student)
  );
  const handleDeleteOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      deleteAction.cancel();
    }
  });
  const retry = useEventCallback(() => {
    retryFailedResult(centersResult);
    retryFailedResult(categoriesResult);
    retryFailedResult(quotasResult);
    retryFailedResult(studentsResult);
  });

  const queryFailed = hasFailedResult(
    centersResult,
    studentsResult,
    categoriesResult,
    quotasResult
  );
  if (queryFailed) {
    return (
      <div className="space-y-3 pt-6" role="alert">
        <p className="font-medium">Students could not be loaded.</p>
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
  const studentsLoading =
    centerId !== null &&
    students.length === 0 &&
    studentsResult.type !== "complete";
  const registrationDataLoading =
    centerId !== null &&
    ((ageCategories.length === 0 && categoriesResult.type !== "complete") ||
      (registrationQuotas.length === 0 && quotasResult.type !== "complete"));
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
        <h2 className="font-display font-semibold text-2xl">Students</h2>
        <p className="text-muted-foreground text-sm">
          You have not been assigned to a Center for student registration.
        </p>
      </div>
    );
  }

  const registrationAvailability = getStudentRegistrationAvailability({
    ageCategoryCount: ageCategories.length,
    centerEnabled: selectedCenter?.studentRegistrationEnabled === true,
    lifecycle: edition.lifecycle,
    quotaCount: registrationQuotas.length,
    referenceDataLoading: registrationDataLoading,
  });
  const registrationOpen = registrationAvailability === "open";

  return (
    <div className="space-y-6 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display font-semibold text-2xl">Students</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            Register and maintain Students for one Center at a time.
          </p>
        </div>
        <div className="min-w-52">
          <label
            className="mb-1 block font-medium text-sm"
            htmlFor="student-center"
          >
            Center
          </label>
          <Select onValueChange={handleCenterChange} value={centerId ?? ""}>
            <SelectTrigger id="student-center">
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
      {registrationAvailability === "open" ? null : (
        <p className="border border-dashed p-3 text-muted-foreground text-sm">
          {registrationAvailabilityMessage(registrationAvailability)}
        </p>
      )}
      <StudentTable
        canManage={registrationOpen}
        data={students as KalakritiStudentRow[]}
        entryRegistrationEnabled={
          selectedCenter?.competitionEntryRegistrationEnabled === true
        }
        isLoading={studentsLoading}
        onDelete={deleteAction.trigger}
        onEdit={handleEdit}
        onRegister={handleRegister}
      />
      {centerId ? (
        <StudentFormDialog
          ageCategories={ageCategories}
          canOverrideAgeCategory={isEditionAdmin}
          centerId={centerId}
          editionId={edition.id}
          existingStudents={students as KalakritiStudentRow[]}
          onOpenChange={handleCreateOpenChange}
          open={createOpen}
        />
      ) : null}
      {centerId ? (
        <StudentFormDialog
          ageCategories={ageCategories}
          canOverrideAgeCategory={isEditionAdmin}
          centerId={centerId}
          editionId={edition.id}
          existingStudents={students as KalakritiStudentRow[]}
          onOpenChange={handleEditOpenChange}
          open={editingStudent !== null}
          student={editingStudent}
        />
      ) : null}
      <ConfirmDialog
        confirmLabel="Delete Student"
        description={`Delete ${deleteAction.payload?.name ?? "this Student"}? This permanently removes the Student, their credential, and any Competition Entries.`}
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={handleDeleteOpenChange}
        open={deleteAction.isOpen}
        title="Delete Student?"
      />
    </div>
  );
}
