import { describe, expect, it } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import type { KalakritiDashboardSection } from "@/lib/server/kalakriti-dashboard-summary";

import { DashboardSectionMetrics } from "./dashboard-section-metrics";

function render(
  id: KalakritiDashboardSection["id"],
  metrics: KalakritiDashboardSection["metrics"]
) {
  return renderToStaticMarkup(
    <DashboardSectionMetrics
      section={{
        id,
        metrics,
        title: id,
        scopeLabel: "Assigned scope",
        attention: [],
      }}
    />
  );
}

describe("dashboard visual summaries", () => {
  it("exposes exact completion counts and accessible progress values", () => {
    const html = render("food", [
      { id: "breakfast", label: "Breakfast served", value: 3, total: 8 },
    ]);
    expect(html).toContain("Breakfast served");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain('aria-valuemax="8"');
    expect(html).toContain('aria-valuetext="3 of 8"');
  });

  it("does not turn an empty denominator into completed or indeterminate progress", () => {
    const html = render("attendance", [
      { id: "attended", label: "Fully attended Entries", value: 0, total: 0 },
    ]);
    expect(html).toContain("No eligible records");
    expect(html).not.toContain('role="progressbar"');
  });

  it("shows all transport stages in order without adding overlapping completions", () => {
    const html = render("transport", [
      { id: "centers", label: "Active Centers", value: 2 },
      { id: "pickup", label: "pickup finalized", value: 2 },
      { id: "venue_arrival", label: "venue arrival finalized", value: 1 },
    ]);
    expect(html.match(/role="progressbar"/g)).toHaveLength(4);
    expect(html.indexOf("Picked up")).toBeLessThan(
      html.indexOf("Arrived at venue")
    );
    expect(html.indexOf("Arrived at venue")).toBeLessThan(
      html.indexOf("Departed venue")
    );
    expect(html.indexOf("Departed venue")).toBeLessThan(
      html.indexOf("Dropped off")
    );
    expect(html.match(/aria-valuetext="0 of 2"/g)).toHaveLength(2);
    expect(html).toContain('aria-valuetext="2 of 2"');
    expect(html).toContain('aria-valuetext="1 of 2"');
  });

  it("does not invent transport work for an empty Edition or another role", () => {
    expect(
      render("transport", [
        { id: "centers", label: "Active Centers", value: 0 },
      ])
    ).toContain("No active Centers");
    const html = render("inventory", [
      { id: "active", label: "Active items", value: 2 },
    ]);
    expect(html).not.toContain("Transport stages");
    expect(html).not.toContain('role="progressbar"');
  });
});
