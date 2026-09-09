import { describe, expect, it } from "bun:test";

import {
  getKalakritiCenterScanProgress,
  getKalakritiStudentTransportLabel,
  getKalakritiCenterTransportLabel,
  getKalakritiCenterTransportStatus,
  type CenterScanStudent,
} from "./kalakriti-center-scan-rules";

const student = (id: string, types: string[] = []): CenterScanStudent => ({
  id,
  name: id,
  humanId: id,
  operations: types.map((type) => ({ type, supersededByOperationId: null })),
});

describe("Center scan progress", () => {
  it("derives Student status from effective marks but Center status from finalization", () => {
    const stages = [
      "pickup",
      "venue_arrival",
      "venue_departure",
      "drop_off",
    ] as const;
    const studentLabels = [
      "Picked up",
      "At Event",
      "Returning",
      "Back at Center",
    ];
    const centerLabels = [
      "Heading to event",
      "At Event",
      "Returning",
      "Back at Center",
    ];
    expect(getKalakritiStudentTransportLabel([])).toBe("Awaiting pickup");
    expect(getKalakritiCenterTransportLabel([])).toBe("Awaiting pickup");
    for (const [index] of stages.entries()) {
      const operations = stages
        .slice(0, index + 1)
        .map((type) => ({ type, supersededByOperationId: null }));
      expect(studentLabels[index]).toBe(
        getKalakritiStudentTransportLabel(operations)
      );
      const sessions = stages
        .slice(0, index + 1)
        .map((stage) => ({ stage, finalizedAt: 1 }));
      expect(centerLabels[index]).toBe(
        getKalakritiCenterTransportLabel(sessions)
      );
    }
    expect(
      getKalakritiStudentTransportLabel([
        { type: "pickup", supersededByOperationId: null },
        { type: "drop_off", supersededByOperationId: "correction" },
        { type: "lunch", supersededByOperationId: null },
      ])
    ).toBe("Picked up");
    expect(
      getKalakritiStudentTransportLabel([
        { type: "pickup", supersededByOperationId: "correction" },
      ])
    ).toBe("Awaiting pickup");
  });
  it("uses all current Students for pickup and never advances on scans alone", () => {
    const center = {
      students: [student("one", ["pickup"]), student("two")],
      scanStages: [],
    };
    let progress = getKalakritiCenterScanProgress(center);
    expect(progress.stage).toBe("pickup");
    expect(progress.roster).toHaveLength(2);
    expect(progress.scannedStudents.map((row) => row.id)).toEqual(["one"]);
    expect(progress.missingStudents.map((row) => row.id)).toEqual(["two"]);
    expect(progress.canFinalize).toBe(true);
    center.students[1] = student("two", ["pickup"]);
    progress = getKalakritiCenterScanProgress(center);
    expect(progress.stage).toBe("pickup");
    expect(progress.canFinalize).toBe(true);
    expect(getKalakritiCenterTransportStatus([])).toBe("planned");
  });

  it("limits later rosters to effective picked-up Students", () => {
    const ignored = student("superseded", ["pickup"]);
    ignored.operations = [
      { type: "pickup", supersededByOperationId: "replacement" },
    ];
    const progress = getKalakritiCenterScanProgress({
      students: [
        student("one", ["pickup", "venue_arrival"]),
        student("two", ["pickup"]),
        student("unpicked"),
        ignored,
      ],
      scanStages: [{ stage: "pickup", finalizedAt: 1 }],
    });
    expect(progress.stage).toBe("venue_arrival");
    expect(progress.roster.map((row) => row.id)).toEqual(["one", "two"]);
    expect(progress.missingStudents.map((row) => row.id)).toEqual(["two"]);
    expect(progress.canFinalize).toBe(false);
  });

  it("requires at least one pickup before allowing absentees", () => {
    expect(
      getKalakritiCenterScanProgress({
        students: [student("absent")],
        scanStages: [],
      }).canFinalize
    ).toBe(false);
  });

  it("rejects empty rosters and ignores unfinished or out-of-order stage rows", () => {
    const scanStages = [
      { stage: "pickup", finalizedAt: null },
      { stage: "venue_departure", finalizedAt: 2 },
    ] as const;
    expect(
      getKalakritiCenterScanProgress({ students: [], scanStages }).canFinalize
    ).toBe(false);
    expect(
      getKalakritiCenterScanProgress({ students: [], scanStages }).stage
    ).toBe("pickup");
    expect(getKalakritiCenterTransportStatus(scanStages)).toBe("planned");
  });

  it("projects the four finalized stages and exposes completion with no next stage", () => {
    const stages = [
      "pickup",
      "venue_arrival",
      "venue_departure",
      "drop_off",
    ] as const;
    const statuses = [
      "departed_center",
      "arrived_at_venue",
      "departed_venue",
      "completed",
    ];
    for (const [index] of stages.entries()) {
      const scanStages = stages
        .slice(0, index + 1)
        .map((stage) => ({ stage, finalizedAt: 1 }));
      expect(statuses[index]).toBe(
        getKalakritiCenterTransportStatus(scanStages)
      );
      const progress = getKalakritiCenterScanProgress({
        students: [student("one", [...stages])],
        scanStages,
      });
      expect(progress.stage).toBe(stages[index + 1] ?? null);
      if (index === 3) {
        expect(progress.canFinalize).toBe(false);
        expect(progress.missingStudents).toEqual([]);
      }
    }
  });
});
