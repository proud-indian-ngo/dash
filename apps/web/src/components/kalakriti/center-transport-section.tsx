import { Badge } from "@pi-dash/design-system/components/ui/badge";
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
        <h3 className="font-display text-xl font-semibold">Transport</h3>
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
                  {assignment.driverPhone ? ` · ${assignment.driverPhone}` : ""}
                </CardDescription>
              </div>
              <Badge
                variant={
                  assignment.status === "completed" ? "outline" : "secondary"
                }
              >
                {assignment.status
                  ? KALAKRITI_TRANSPORT_STATUS_LABELS[assignment.status]
                  : "Unknown"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-muted-foreground text-sm">
                Capacity: {assignment.capacity}
                {assignment.notes ? ` · ${assignment.notes}` : ""}
              </p>
              <p className="text-muted-foreground text-sm">
                Pickup:{" "}
                {assignment.pickupTime == null
                  ? "Not scheduled"
                  : new Date(assignment.pickupTime).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
