import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
let queryIndex = 0;
let online = true;
let queryType = "complete";
let centers = [{ id: "center", name: "Center A", retiredAt: null }];
let center = {
  edition: { lifecycle: "live" } as { lifecycle: string } | undefined,
  students: [
    {
      id: "student-1",
      name: "Ananya",
      humanId: "KAL-2162-0001",
      operations: [] as {
        type: string;
        supersededByOperationId: string | null;
      }[],
    },
    {
      id: "student-2",
      name: "Dev",
      humanId: "KAL-2162-0002",
      operations: [] as {
        type: string;
        supersededByOperationId: string | null;
      }[],
    },
  ],
  scanStages: [] as {
    stage: "pickup" | "venue_arrival";
    finalizedAt: number | null;
  }[],
};
mock.module("@rocicorp/zero/react", () => ({
  useQuery: () =>
    queryIndex++ === 0
      ? [centers, { type: "complete" }]
      : [center, { type: queryType }],
  useZero: () => ({}),
  useConnectionState: () => ({ name: online ? "connected" : "disconnected" }),
}));
mock.module("@pi-dash/design-system/components/ui/dialog", () => ({
  Dialog: pass,
  DialogContent: pass,
  DialogHeader: pass,
  DialogTitle: pass,
  DialogDescription: pass,
}));
mock.module("@/components/form/form-layout", () => ({ FormLayout: pass }));
mock.module("@/components/form/input-field", () => ({
  InputField: ({ label }: { label: string }) => <input aria-label={label} />,
}));
mock.module("@/components/form/form-actions", () => ({
  FormActions: ({
    disabled,
    submitLabel,
  }: {
    disabled: boolean;
    submitLabel: string;
  }) => (
    <button disabled={disabled} type="submit">
      {submitLabel}
    </button>
  ),
}));
mock.module("@/components/kalakriti/event-day-qr-scanner", () => ({
  EventDayQrScanner: () => (
    <p role="alert">
      Camera couldn't start. Enter the yearly ID manually instead.
    </p>
  ),
}));
mock.module("@/components/shared/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));
const { CenterScanDialog } = await import("./center-scan-dialog");
function render() {
  queryIndex = 0;
  return renderToStaticMarkup(
    <CenterScanDialog
      editionId="edition"
      year={2162}
      onOpenChange={() => undefined}
    />
  );
}
beforeEach(() => {
  online = true;
  queryType = "complete";
  centers = [{ id: "center", name: "Center A", retiredAt: null }];
  center = {
    edition: { lifecycle: "live" },
    students: [
      {
        id: "student-1",
        name: "Ananya",
        humanId: "KAL-2162-0001",
        operations: [],
      },
      {
        id: "student-2",
        name: "Dev",
        humanId: "KAL-2162-0002",
        operations: [],
      },
    ],
    scanStages: [],
  };
});
describe("Center scan modal", () => {
  it("shows the single authorized Center name without a dropdown", () => {
    const html = render();
    expect(html).toContain("Center A");
    expect(html).not.toContain('role="combobox"');
    expect(html).toContain("Current stage:");
  });
  it("keeps the Center dropdown when multiple Centers are available", () => {
    centers.push({ id: "other", name: "Center B", retiredAt: null });
    const html = render();
    expect(html).toContain('role="combobox"');
    expect(html).toContain("Select Center");
    expect(html).not.toContain("Current stage:");
  });
  it("does not start or pin a session from a partial cached Center", () => {
    queryType = "unknown";
    const html = render();
    expect(html).not.toContain("Current stage:");
    expect(html).not.toContain("Camera couldn");
    expect(html).not.toContain("Mark Student");
  });
  it("shows the backend-derived stage and missing Students, not a checkpoint picker", () => {
    const html = render();
    expect(html).toContain("Pickup");
    expect(html).toContain("Ananya");
    expect(html).toContain("Dev");
    expect(html).toContain("Missing Students");
    expect(html).toContain('aria-label="Stage progress"');
    expect(html).not.toContain("Transport checkpoint");
    const finish = html.match(/<button\b[^>]*>Finish stage<\/button>/)?.[0];
    expect(finish).toContain('disabled=""');
  });
  it("keeps yearly ID fallback available when the camera fails without autofocus", () => {
    const html = render();
    expect(html).toContain("Camera couldn");
    expect(html).toContain('aria-label="Yearly ID"');
    expect(html).toContain("Mark Student");
    expect(html.toLowerCase()).not.toContain("autofocus");
  });
  it("allows pickup with absentees but requires all travelers for arrival", () => {
    center.students[0]!.operations = [
      { type: "pickup", supersededByOperationId: null },
    ];
    const pickup = render();
    expect(
      pickup.match(/<button\b[^>]*>Finish stage<\/button>/)?.[0]
    ).not.toContain('disabled=""');
    expect(pickup).toContain("Unmarked students");
    center.scanStages = [{ stage: "pickup", finalizedAt: 100 }];
    const arrival = render();
    expect(arrival).not.toContain("Dev");
    expect(
      arrival.match(/<button\b[^>]*>Finish stage<\/button>/)?.[0]
    ).toContain('disabled=""');
    center.students[0]!.operations.push({
      type: "venue_arrival",
      supersededByOperationId: null,
    });
    expect(
      render().match(/<button\b[^>]*>Finish stage<\/button>/)?.[0]
    ).not.toContain('disabled=""');
  });
  it("enables explicit finish when every roster Student is marked", () => {
    for (const student of center.students)
      student.operations = [{ type: "pickup", supersededByOperationId: null }];
    const html = render();
    expect(html).toContain("All Students are marked.");
    expect(
      html.match(/<button\b[^>]*>Finish stage<\/button>/)?.[0]
    ).not.toContain('disabled=""');
    expect(html).toContain("Pickup");
  });
  it("reopening derives venue arrival from the durable finalized stage", () => {
    for (const student of center.students)
      student.operations = [{ type: "pickup", supersededByOperationId: null }];
    center.scanStages = [{ stage: "pickup", finalizedAt: 100 }];
    expect(render()).toContain("Venue arrival");
  });
  it("keeps an empty Center incomplete", () => {
    center.students = [];
    const html = render();
    expect(html).toContain("No Students are registered at this Center.");
    expect(html.match(/<button\b[^>]*>Finish stage<\/button>/)?.[0]).toContain(
      "disabled"
    );
  });
  it("fails closed when the live Edition relation is unavailable", () => {
    center.edition = undefined;
    const html = render();
    expect(html).toContain("when the event starts");
    expect(html).not.toContain("Camera couldn");
    expect(html.match(/<button\b[^>]*>Mark Student<\/button>/)?.[0]).toContain(
      'disabled=""'
    );
  });
  it("uses the reactive Edition lifecycle rather than assuming an open station remains live", () => {
    center.edition = { lifecycle: "archived" };
    const html = render();
    expect(html).not.toContain("Camera couldn");
    expect(html.match(/<button\b[^>]*>Finish stage<\/button>/)?.[0]).toContain(
      'disabled=""'
    );
  });
  it("disables recording outside live and while offline", () => {
    center.edition = { lifecycle: "draft" };
    expect(render()).toContain("when the event starts");
    center.edition = { lifecycle: "live" };
    online = false;
    const html = render();
    expect(html).toContain("Reconnect to keep scanning");
    expect(html.match(/<button\b[^>]*>Mark Student<\/button>/)?.[0]).toContain(
      "disabled"
    );
  });
});
