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
  OperationScanPanel: ({ activity }: { activity: string }) => (
    <p>{activity} capture</p>
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
    expect(html).not.toContain("meals capture");
  });
  it("shows a single activity without unnecessary tabs or transport", () => {
    const html = render(["meals"]);
    expect(html).not.toContain('role="tablist"');
    expect(html).toContain("meals capture");
    expect(html).not.toContain("Transport roster");
  });
  it("fails closed when no scanning activity is authorized", () => {
    const html = render([]);
    expect(html).toContain("no longer available");
    expect(html).not.toContain("Transport roster");
  });
});
