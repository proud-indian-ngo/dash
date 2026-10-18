import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@pi-dash/design-system/components/ui/card";
import {
  KALAKRITI_TRANSPORT_STATUS_LABELS,
  type KalakritiTransportStatus,
} from "@pi-dash/shared/kalakriti";
import { format } from "date-fns";

import { StatusBadge } from "@/components/shared/status-badge";
import { DATE_TIME } from "@/lib/date-formats";

export interface CenterTransportAssignment {
  capacity: number;
  driverName: string;
  driverPhone: string | null;
  id: string;
  notes: string | null;
  pickupTime?: number | null;
  status: KalakritiTransportStatus | null;
  vehicleLabel: string;
}

export function CenterTransportSection({
  assignments,
}: {
  assignments: readonly CenterTransportAssignment[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">Transport</h3>
        <p className="text-muted-foreground text-sm">
          Manage vehicles and drivers from the Transport page.
        </p>
      </div>
      {assignments.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No transport assignments yet.
        </p>
      ) : (
        assignments.map((assignment) => (
          <Card key={assignment.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div className="space-y-1">
                <h4 className="text-base font-medium">
                  {assignment.vehicleLabel}
                </h4>
                <CardDescription>
                  Driver: {assignment.driverName}
                  {assignment.driverPhone ? (
                    <>
                      {" · "}
                      <a
                        className="text-primary underline-offset-4 hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-10 pointer-coarse:items-center"
                        href={`tel:${assignment.driverPhone.replaceAll(/[^\d+]/g, "")}`}
                      >
                        {assignment.driverPhone}
                      </a>
                    </>
                  ) : null}
                </CardDescription>
              </div>
              <StatusBadge
                tone={
                  assignment.status
                    ? assignment.status === "completed"
                      ? "success"
                      : "info"
                    : "neutral"
                }
              >
                {assignment.status
                  ? KALAKRITI_TRANSPORT_STATUS_LABELS[assignment.status]
                  : "Unknown"}
              </StatusBadge>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-1 text-sm">
              <p>
                Pickup:{" "}
                {assignment.pickupTime == null
                  ? "Not scheduled"
                  : format(new Date(assignment.pickupTime), DATE_TIME)}
              </p>
              <p>
                Capacity: {assignment.capacity}
                {assignment.notes ? ` · ${assignment.notes}` : ""}
              </p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
