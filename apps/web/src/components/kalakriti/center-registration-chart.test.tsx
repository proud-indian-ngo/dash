import { describe, expect, it } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import type { KalakritiRegistrationDashboardProjection } from "@/lib/server/kalakriti-registration-dashboard";

import { CenterRegistrationChart } from "./center-registration-chart";

type Center = KalakritiRegistrationDashboardProjection["centers"][number];

function center(
  id: string,
  students: number,
  registeredStudents: number
): Center {
  return {
    id,
    name: id,
    students,
    registeredStudents,
    entries: registeredStudents,
    participants: registeredStudents,
    studentLimit: 20,
  };
}

describe("CenterRegistrationChart", () => {
  it("shows the five least complete visible Centers with exact fractions", () => {
    const html = renderToStaticMarkup(
      <CenterRegistrationChart
        centers={[
          center("complete", 4, 4),
          center("half", 10, 5),
          center("empty", 8, 0),
          center("third", 9, 3),
          center("quarter", 8, 2),
          center("threequarters", 8, 6),
        ]}
      />
    );

    expect(html).toContain("Showing 5 of 6 visible Centers");
    expect(html).toContain("2 with an Entry / 8 Students");
    expect(html).toContain("Full list in Registration breakdown.");
    expect(html).not.toContain("complete");
    expect(html.indexOf("empty")).toBeLessThan(html.indexOf("quarter"));
    expect(html.indexOf("quarter")).toBeLessThan(html.indexOf("third"));
    expect(html.indexOf("third")).toBeLessThan(html.indexOf("half"));
    expect(html.indexOf("half")).toBeLessThan(html.indexOf("threequarters"));
  });

  it("labels zero-Student Centers without treating them as completed", () => {
    const html = renderToStaticMarkup(
      <CenterRegistrationChart centers={[center("No roster", 0, 0)]} />
    );

    expect(html).toContain("No roster");
    expect(html).toContain("No Students");
    expect(html).not.toContain("aria-valuenow");
  });
});
