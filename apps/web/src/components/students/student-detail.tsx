import { Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { formatEnumLabel } from "@pi-dash/shared/constants";
import type {
  Center,
  ClassEventStudent,
  Student,
  TeamEvent,
} from "@pi-dash/zero/schema";
import { useState } from "react";
import { StudentFormDialog } from "@/components/students/student-form-dialog";
import { useApp } from "@/context/app-context";

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

function capitalizeGender(gender: string | null): string {
  if (!gender) {
    return "—";
  }
  return gender.charAt(0).toUpperCase() + gender.slice(1);
}

export function StudentDetail({ student }: StudentDetailProps) {
  const { hasPermission } = useApp();
  const [editOpen, setEditOpen] = useState(false);
  const canEdit = hasPermission("students.manage");

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
          {canEdit ? (
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
          ) : null}
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
            <p className="text-sm">{capitalizeGender(student.gender)}</p>
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

      {canEdit ? (
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
        />
      ) : null}
    </>
  );
}
