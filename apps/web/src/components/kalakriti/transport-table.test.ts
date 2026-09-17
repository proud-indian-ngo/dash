import { describe, expect, it } from "bun:test";

import { countTransport } from "./transport-stats";
import { buildTransportRows, type TransportCenter } from "./transport-table";

const center: TransportCenter = {
  id: "center-a",
  name: "Center A",
  location: "Main road",
  googleMapsUrl: "https://maps.google.com/?q=Main+road",
  transportAssignments: [],
};
const assignment = {
  id: "bus-a",
  capacity: 40,
  driverName: "Driver",
  driverPhone: null,
  notes: null,
  status: "planned" as const,
  vehicleLabel: "KA 01 AB 1234",
  pickupTime: 1_800_000_000_000,
};

describe("Transport vehicle rows", () => {
  it("includes Centers without vehicles and gives every vehicle its own row", () => {
    const rows = buildTransportRows([
      center,
      {
        ...center,
        id: "center-b",
        transportAssignments: [
          assignment,
          {
            ...assignment,
            id: "bus-b",
            pickupTime: assignment.pickupTime + 60_000,
          },
        ],
      },
    ]);
    expect(rows.map((row) => row.id)).toEqual(["center-a", "bus-a", "bus-b"]);
    expect(rows[0]?.assignment).toBeNull();
    expect(rows[1]?.center.location).toBe("Main road");
    expect(rows[2]?.assignment?.pickupTime).toBe(
      assignment.pickupTime + 60_000
    );
  });
  it("does not invent a status or vehicle for an empty directory", () => {
    expect(buildTransportRows([])).toEqual([]);
  });
  it("counts distinct active Centers, every assigned vehicle, and finalized stages independently", () => {
    expect(
      countTransport([
        {
          ...center,
          scanStages: [
            { stage: "pickup", finalizedAt: 1 },
            { stage: "venue_arrival", finalizedAt: null },
          ],
        },
        {
          ...center,
          id: "center-b",
          transportAssignments: [assignment, { ...assignment, id: "bus-b" }],
          scanStages: [
            { stage: "pickup", finalizedAt: 1 },
            { stage: "venue_arrival", finalizedAt: 2 },
            { stage: "drop_off", finalizedAt: 3 },
          ],
        },
      ])
    ).toEqual({
      centers: 2,
      missingVehicles: 1,
      vehicles: 2,
      stages: { pickup: 2, venue_arrival: 1, venue_departure: 0, drop_off: 1 },
    });
  });
});
