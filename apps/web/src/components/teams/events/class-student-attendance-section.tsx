import {
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { ClassEventStudent, Student, User } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import type { ColumnDef } from "@tanstack/react-table";
import { log } from "evlog";
import { useMemo } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { handleMutationResult } from "@/lib/mutation-result";

type StudentAttendanceRow = ClassEventStudent & {
  student?: Student & { center?: { id: string; name: string } | null };
  attendanceMarkedByUser?: User;
};

function searchFn(row: StudentAttendanceRow, query: string): boolean {
  const q = query.toLowerCase();
  return (row.student?.name ?? "").toLowerCase().includes(q);
}

function AttendanceToggle({
  row,
  eventId,
  canMark,
}: {
  row: StudentAttendanceRow;
  eventId: string;
  canMark: boolean;
}) {
  const zero = useZero();

  function toggle(status: "present" | "absent") {
    const next = row.attendance === status ? null : status;
    const result = zero.mutate(
      mutators.classEventStudent.markAttendance({
        id: row.id,
        eventId,
        attendance: next,
        now: Date.now(),
      })
    );
    result.server
      .then((res) =>
        handleMutationResult(res, {
          mutation: "classEventStudent.markAttendance",
          entityId: row.id,
          errorMsg: "Failed to update attendance",
        })
      )
      .catch((e) =>
        log.error({
          component: "ClassStudentAttendanceSection",
          action: "markAttendance",
          entityId: row.id,
          error: e instanceof Error ? e.message : String(e),
        })
      );
  }

  if (!canMark) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  return (
    <div className="flex gap-1">
      <Button
        aria-label={`Mark ${row.student?.name ?? "student"} present`}
        className={
          row.attendance === "present"
            ? "bg-success/10 text-success hover:bg-success/20"
            : ""
        }
        onClick={() => toggle("present")}
        size="icon"
        variant={row.attendance === "present" ? "secondary" : "ghost"}
      >
        <HugeiconsIcon
          className="size-4"
          icon={CheckmarkCircle02Icon}
          strokeWidth={2}
        />
      </Button>
      <Button
        aria-label={`Mark ${row.student?.name ?? "student"} absent`}
        onClick={() => toggle("absent")}
        size="icon"
        variant={row.attendance === "absent" ? "destructive" : "ghost"}
      >
        <HugeiconsIcon
          className="size-4"
          icon={CancelCircleIcon}
          strokeWidth={2}
        />
      </Button>
    </div>
  );
}

function buildColumns(
  eventId: string,
  canMark: boolean
): ColumnDef<StudentAttendanceRow>[] {
  return [
    {
      id: "studentName",
      accessorFn: (row) => row.student?.name ?? "Unknown",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Student"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.student?.name ?? "Unknown"}
        </span>
      ),
      meta: {
        headerTitle: "Student",
        skeleton: <Skeleton className="h-5 w-40" />,
      },
      size: 200,
    },
    {
      id: "status",
      accessorFn: (row) => (row.student?.isActive ? "Active" : "Inactive"),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Status"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.student?.isActive ? (
            <span className="text-success">Active</span>
          ) : (
            <span className="text-muted-foreground">Inactive</span>
          )}
        </span>
      ),
      meta: {
        headerTitle: "Status",
        skeleton: <Skeleton className="h-5 w-20" />,
      },
      size: 100,
    },
    {
      id: "attendance",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Attendance"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <AttendanceToggle
          canMark={canMark}
          eventId={eventId}
          row={row.original}
        />
      ),
      meta: {
        headerTitle: "Attendance",
        skeleton: <Skeleton className="h-9 w-20" />,
      },
      size: 150,
    },
    {
      id: "markedBy",
      accessorFn: (row) => row.attendanceMarkedByUser?.name ?? "",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Marked By"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {row.original.attendanceMarkedByUser?.name ?? "—"}
        </span>
      ),
      meta: {
        headerTitle: "Marked By",
        skeleton: <Skeleton className="h-5 w-24" />,
      },
      size: 120,
    },
  ];
}

export function ClassStudentAttendanceSection({
  eventId,
  eventStartTime,
  eventType,
}: {
  eventId: string;
  eventStartTime: number;
  eventType: string;
}) {
  const zero = useZero();
  const [students] = useQuery(queries.classEventStudent.byEvent({ eventId }), {
    enabled: eventType === "class",
  });

  const hasStarted = Date.now() >= eventStartTime;
  const canMark = hasStarted;

  function markAllPresent() {
    const result = zero.mutate(
      mutators.classEventStudent.markAllPresent({
        eventId,
        now: Date.now(),
      })
    );
    result.server
      .then((res) =>
        handleMutationResult(res, {
          mutation: "classEventStudent.markAllPresent",
          entityId: eventId,
          successMsg: "All marked present",
          errorMsg: "Failed to mark attendance",
        })
      )
      .catch((e) =>
        log.error({
          component: "ClassStudentAttendanceSection",
          action: "markAllPresent",
          entityId: eventId,
          error: e instanceof Error ? e.message : String(e),
        })
      );
  }

  const columns = useMemo(
    () => buildColumns(eventId, canMark),
    [eventId, canMark]
  );

  const studentList = (students ?? []) as StudentAttendanceRow[];
  const presentCount = studentList.filter(
    (s) => s.attendance === "present"
  ).length;

  if (eventType !== "class") {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-sm">
          Student Attendance ({presentCount}/{studentList.length} present)
        </h2>
        {studentList.length > 0 && canMark ? (
          <Button onClick={markAllPresent} size="sm">
            <HugeiconsIcon
              className="size-4"
              icon={UserGroupIcon}
              strokeWidth={2}
            />
            Mark All Present
          </Button>
        ) : null}
      </div>

      <DataTableWrapper
        columns={columns}
        data={studentList}
        emptyMessage="No students enrolled in this class."
        getRowId={(row) => row.id}
        isLoading={false}
        searchFn={searchFn}
        storageKey="class_student_attendance_table_state_v1"
        tableLayout={{
          columnsResizable: true,
          columnsDraggable: true,
          columnsVisibility: true,
          columnsPinnable: true,
        }}
      />
    </div>
  );
}
