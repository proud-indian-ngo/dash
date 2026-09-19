import { describe, expect, it, mock } from "bun:test";

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ScanActivity } from "@/lib/kalakriti-event-day-policy";
const pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
mock.module("@pi-dash/design-system/components/ui/dialog", () => ({
  Dialog: pass,
  DialogContent: pass,
  DialogHeader: pass,
  DialogTitle: pass,
  DialogDescription: pass,
}));
mock.module("./center-scan-dialog", () => ({
  CenterScanPanel: () => <p>Transport roster</p>,
}));
mock.module("./operation-scan-panel", () => ({
  OperationScanPanel: ({
    activity,
    fixedSessionId,
  }: {
    activity: string;
    fixedSessionId?: string;
  }) => (
    <p>
      {activity} capture {fixedSessionId}
    </p>
  ),
}));
mock.module("./inventory-scan-panel", () => ({
  InventoryScanPanel: ({ action }: { action: string }) => (
    <p>{action} inventory capture</p>
  ),
}));
const { ScanDialog } = await import("./scan-dialog");
function render(activities: ScanActivity[]) {
  return renderToStaticMarkup(
    <ScanDialog
      editionId="edition"
      year={2162}
      activities={activities}
      onOpenChange={() => undefined}
    />
  );
}
describe("Role-aware sidebar Scan dialog", () => {
  it("shows only applicable tabs and defaults to transport", () => {
    const html = render(["meals", "transport", "check_in", "attendance"]);
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html).toContain("Transport roster");
    expect(html).toContain("Mark Students at each transport stage.");
    expect(html).not.toContain("meals capture");
  });
  it("shows a single activity without unnecessary tabs or transport", () => {
    const html = render(["meals"]);
    expect(html).not.toContain('role="tablist"');
    expect(html).toContain("meals capture");
    expect(html).toContain("Record breakfast or lunch service.");
    expect(html).not.toContain("Transport roster");
  });
  it("offers dispatch and return to logistics staff", () => {
    const html = render(["dispatch", "return"]);
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toContain("dispatch inventory capture");
    expect(html).not.toContain("Transport roster");
  });
  it("fails closed when no scanning activity is authorized", () => {
    const html = render([]);
    expect(html).toContain("no longer available");
    expect(html).not.toContain("Transport roster");
  });
  it("passes a fixed Competition session to attendance capture", () => {
    const html = renderToStaticMarkup(
      <ScanDialog
        activities={["attendance"]}
        editionId="edition"
        fixedSessionId="session-1"
        initialActivity="attendance"
        onOpenChange={() => undefined}
        year={2162}
      />
    );
    expect(html).toContain("attendance capture session-1");
  });
});
