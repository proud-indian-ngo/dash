import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@pi-dash/design-system/components/ui/sheet";
import {
  type CenterScanStudent,
  getKalakritiStudentTransportLabel,
} from "@pi-dash/zero/kalakriti-center-scan-rules";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { useMemo } from "react";

import { PersonQrPanel } from "@/components/kalakriti/person-qr-panel";
import type { KalakritiStudentRow } from "@/components/kalakriti/student-form-dialog";
import { useTransportStatusSnapshot } from "@/components/kalakriti/use-transport-status-snapshot";
import { Loader } from "@/components/loader";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

function studentTransportLabel(student: Pick<CenterScanStudent, "operations">) {
  return getKalakritiStudentTransportLabel(student.operations);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export function StudentDetailSheet({
  access,
  center,
  onOpenChange,
  open,
  student,
}: {
  access: KalakritiEditionAccess;
  center: {
    id: string;
    name: string;
  };
  onOpenChange: (open: boolean) => void;
  open: boolean;
  student: KalakritiStudentRow;
}) {
  const [entries, result] = useQuery(
    queries.kalakritiEntry.visibleByCenter({
      editionId: access.edition.id,
      centerId: center.id,
    }),
    { enabled: open }
  );
  const [students, studentsResult] = useQuery(
    queries.kalakritiStudent.visibleByCenter({
      editionId: access.edition.id,
      centerId: center.id,
    }),
    { enabled: open }
  );
  const statusRows = useMemo(
    () => students.filter((row) => row.id === student.id),
    [students, student.id]
  );
  const { labels } = useTransportStatusSnapshot({
    data: statusRows,
    scopeKey: `${access.edition.id}:${center.id}:${student.id}`,
    complete: studentsResult.type === "complete",
    getStatus: studentTransportLabel,
  });
  const transportStatus =
    labels?.get(student.id) ??
    (studentsResult.type === "complete" || studentsResult.type === "error"
      ? "Unavailable"
      : "Loading...");
  const participation = entries.filter(
    (entry) =>
      entry.editionId === access.edition.id &&
      entry.centerId === student.centerId &&
      entry.members.some((member) => member.studentId === student.id)
  );
  const isLoading = entries.length === 0 && result.type !== "complete";
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{student.name}</SheetTitle>
          <SheetDescription>
            Student details, Center and Competition participation.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-6 pb-6">
          <div className="grid gap-3">
            <DetailRow label="Student ID" value={student.humanId} />
            <DetailRow
              label="Date of birth"
              value={format(new Date(student.dateOfBirth), "dd MMM yyyy")}
            />
            <DetailRow
              label="Gender"
              value={student.gender === "female" ? "Female" : "Male"}
            />
            <DetailRow
              label="Age Category"
              value={student.ageCategory?.name ?? "Unassigned"}
            />
          </div>
          <PersonQrPanel enabled={open} id={student.id} type="student" />
          <section className="grid gap-3">
            <h3 className="text-sm font-medium">Center details</h3>
            <DetailRow label="Center" value={center.name} />
            <DetailRow label="Transport status" value={transportStatus} />
          </section>
          <section className="grid gap-3">
            <h3 className="text-sm font-medium">Competitions</h3>
            {result.type === "error" ? (
              <div className="grid gap-2" role="alert">
                <p className="text-sm">Competitions could not be loaded.</p>
                <Button
                  onClick={() => result.retry()}
                  size="sm"
                  variant="outline"
                >
                  Retry
                </Button>
              </div>
            ) : isLoading ? (
              <div aria-label="Loading Competitions" role="status">
                <Loader />
              </div>
            ) : participation.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No Competition Entries yet.
              </p>
            ) : (
              <ul className="grid gap-3">
                {participation.map((entry) => (
                  <li className="grid gap-1" key={entry.id}>
                    <span className="text-sm font-medium">
                      {entry.division?.competition?.name ?? "Competition"}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {entry.division?.ageCategory?.name}
                    </span>
                    <Badge variant="outline">
                      {entry.participationMode === "group"
                        ? "Group"
                        : "Individual"}
                    </Badge>
                    {entry.division?.competition?.cancelledAt != null ? (
                      <Badge variant="secondary">Cancelled</Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
