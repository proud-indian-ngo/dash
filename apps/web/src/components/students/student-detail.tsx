import { Delete02Icon, Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { formatEnumLabel } from "@pi-dash/shared/constants";
import { mutators } from "@pi-dash/zero/mutators";
import type {
  Center,
  ClassEventStudent,
  Student,
  TeamEvent,
} from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StudentFormDialog } from "@/components/students/student-form-dialog";
import { useApp } from "@/context/app-context";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { handleMutationResult } from "@/lib/mutation-result";

export type StudentDetailData = Student & {
  center: Center | undefined;
  classEvents: ReadonlyArray<
    ClassEventStudent & { event: TeamEvent | undefined }
  >;
};

interface StudentDetailProps {
  student: StudentDetailData;
}

function formatDateOfBirth(dob: number | null): string {
  if (!dob) {
    return "—";
  }
  return new Date(dob).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function StudentDetail({ student }: StudentDetailProps) {
  const { hasPermission } = useApp();
  const zero = useZero();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);

  const isAdmin = hasPermission("students.manage");
  const hasAttended = student.classEvents.some((ce) => ce.attendance !== null);
  // Non-admin who has attended can only edit DOB
  const restrictedEdit = !isAdmin && hasAttended;

  const deleteAction = useConfirmAction({
    onConfirm: async () => {
      const res = await zero.mutate(mutators.student.delete({ id: student.id }))
        .server;
      handleMutationResult(res, {
        mutation: "student.delete",
        entityId: student.id,
        successMsg: "Student deleted",
        errorMsg: "Couldn't delete student",
      });
      if (res.type !== "error") {
        navigate({ to: "/students" });
      }
      return res;
    },
    onError: (msg) => {
      log.error({
        component: "StudentDetail",
        mutation: "student.delete",
        entityId: student.id,
        error: msg ?? "unknown",
      });
      toast.error("Couldn't delete student");
    },
  });

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display font-semibold text-2xl tracking-tight">
              {student.name}
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              {student.center?.name || "No center assigned"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setEditOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <HugeiconsIcon
                className="size-4"
                icon={Edit02Icon}
                strokeWidth={2}
              />
              Edit
            </Button>
            {isAdmin ? (
              <Button
                onClick={() => deleteAction.trigger()}
                size="sm"
                type="button"
                variant="destructive"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={Delete02Icon}
                  strokeWidth={2}
                />
                Delete
              </Button>
            ) : null}
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-1">
            <p className="font-medium text-muted-foreground text-xs uppercase">
              Status
            </p>
            <Badge variant={student.isActive ? "default" : "secondary"}>
              {student.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>

          <div className="space-y-1">
            <p className="font-medium text-muted-foreground text-xs uppercase">
              City
            </p>
            <p className="text-sm">
              {student.city ? formatEnumLabel(student.city) : "—"}
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-medium text-muted-foreground text-xs uppercase">
              Date of Birth
            </p>
            <p className="text-sm">{formatDateOfBirth(student.dateOfBirth)}</p>
          </div>

          <div className="space-y-1">
            <p className="font-medium text-muted-foreground text-xs uppercase">
              Gender
            </p>
            <p className="text-sm">
              {student.gender ? formatEnumLabel(student.gender) : "—"}
            </p>
          </div>
        </div>

        {student.notes ? (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="font-medium text-muted-foreground text-xs uppercase">
                Notes
              </p>
              <p className="whitespace-pre-wrap text-sm">{student.notes}</p>
            </div>
          </>
        ) : null}

        {student.classEvents.length > 0 ? (
          <>
            <Separator />
            <div className="space-y-3">
              <p className="font-medium text-muted-foreground text-xs uppercase">
                Attendance History
              </p>
              <div className="space-y-2">
                {student.classEvents.map((ce) => (
                  <div
                    className="flex items-center justify-between rounded-lg border p-3 text-sm"
                    key={ce.id}
                  >
                    <span>{ce.event?.name || "Unknown Event"}</span>
                    {ce.attendance ? (
                      <Badge
                        variant={
                          ce.attendance === "present" ? "default" : "secondary"
                        }
                      >
                        {formatEnumLabel(ce.attendance)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">
                        No attendance
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <StudentFormDialog
        initialValues={{
          id: student.id,
          name: student.name,
          dateOfBirth: student.dateOfBirth ?? null,
          gender: (student.gender as "male" | "female" | null) ?? null,
          centerId: student.centerId ?? null,
          city: student.city || "bangalore",
          notes: student.notes ?? null,
        }}
        onOpenChange={setEditOpen}
        open={editOpen}
        restrictedEdit={restrictedEdit}
      />

      <ConfirmDialog
        confirmLabel="Delete"
        description="This will permanently delete the student and all their attendance records. This cannot be undone."
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={(open) => {
          if (!open) {
            deleteAction.cancel();
          }
        }}
        open={deleteAction.isOpen}
        title="Delete student"
      />
    </>
  );
}
