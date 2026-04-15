import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { StudentFormDialog } from "@/components/students/student-form-dialog";
import {
  type StudentRow,
  StudentsTable,
  studentHasAttended,
} from "@/components/students/students-table";
import { useApp } from "@/context/app-context";
import { handleMutationResult } from "@/lib/mutation-result";
import { assertAnyPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/students/")({
  head: () => ({
    meta: [{ title: `Students | ${env.VITE_APP_NAME}` }],
  }),
  beforeLoad: ({ context }) =>
    assertAnyPermission(context, "students.view", "students.manage"),
  loader: ({ context }) => {
    context.zero?.preload(queries.student.all());
  },
  component: StudentsRouteComponent,
});

function StudentsRouteComponent() {
  const { hasPermission } = useApp();
  const navigate = useNavigate();
  const zero = useZero();
  const [createOpen, setCreateOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<StudentRow | null>(null);

  const isAdmin = hasPermission("students.manage");

  const [data, result] = useQuery(queries.student.all());
  const isLoading = data.length === 0 && result.type !== "complete";

  const handleDeactivate = async (id: string) => {
    const res = await zero.mutate(
      mutators.student.deactivate({ id, now: Date.now() })
    ).server;
    handleMutationResult(res, {
      mutation: "student.deactivate",
      entityId: id,
      successMsg: "Student deactivated",
      errorMsg: "Couldn't deactivate student",
    });
  };

  const handleDelete = async (id: string) => {
    const res = await zero.mutate(mutators.student.delete({ id })).server;
    handleMutationResult(res, {
      mutation: "student.delete",
      entityId: id,
      successMsg: "Student deleted",
      errorMsg: "Couldn't delete student",
    });
  };

  const restrictedEdit =
    !!editStudent && !isAdmin && studentHasAttended(editStudent);

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        Students
      </h1>

      <div className="mt-4 grid gap-6 *:min-w-0">
        <StudentsTable
          canDelete={isAdmin}
          canEdit
          data={data ?? []}
          isLoading={isLoading}
          onDeactivate={handleDeactivate}
          onDelete={handleDelete}
          onEdit={setEditStudent}
          onNavigate={(id) => {
            navigate({ to: "/students/$id", params: { id } });
          }}
          toolbarActions={
            isAdmin ? (
              <Button
                onClick={() => setCreateOpen(true)}
                size="sm"
                type="button"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={PlusSignIcon}
                  strokeWidth={2}
                />
                Add student
              </Button>
            ) : undefined
          }
        />
      </div>

      {isAdmin ? (
        <StudentFormDialog onOpenChange={setCreateOpen} open={createOpen} />
      ) : null}

      {editStudent ? (
        <StudentFormDialog
          initialValues={{
            id: editStudent.id,
            name: editStudent.name,
            dateOfBirth: editStudent.dateOfBirth ?? null,
            gender: (editStudent.gender as "male" | "female" | null) ?? null,
            centerId: editStudent.centerId ?? null,
            city: editStudent.city || "bangalore",
            notes: editStudent.notes ?? null,
          }}
          onOpenChange={(open) => {
            if (!open) {
              setEditStudent(null);
            }
          }}
          open
          restrictedEdit={restrictedEdit}
        />
      ) : null}
    </div>
  );
}
