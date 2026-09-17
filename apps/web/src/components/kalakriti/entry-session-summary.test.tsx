import { describe, expect, it } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { EntrySessionSummary } from "./entry-session-summary";

describe("Session participation summary", () => {
  it("counts distinct Students and effective attendance without multiplying group members", () => {
    const html = renderToStaticMarkup(
      <EntrySessionSummary
        entries={2}
        studentIds={["a", "b", "a"]}
        attendanceIds={["session:a", "session:b", "session:a"]}
        present={
          new Map([
            ["a", "Present"],
            ["b", "Present"],
          ])
        }
        attended={
          new Map([
            ["session:a", "Attended"],
            ["session:b", "Not attended"],
          ])
        }
        ready
        missingMusic={1}
        onReviewMusic={() => {}}
      />
    );
    expect(html).toContain("2 / 2");
    expect(html).toContain("1 / 2");
    expect(html).toContain('aria-valuetext="1 of 2 Students"');
    expect(html).toContain("1 Entries missing required music");
  });

  it("never presents an incomplete snapshot as zero", () => {
    const html = renderToStaticMarkup(
      <EntrySessionSummary
        entries={0}
        studentIds={[]}
        attendanceIds={[]}
        present={undefined}
        attended={undefined}
        ready={false}
        onReviewMusic={() => {}}
      />
    );
    expect(html).toContain("Checking");
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain("missing required music");
  });

  it("keeps a genuinely empty Session numeric without claiming completed attendance", () => {
    const html = renderToStaticMarkup(
      <EntrySessionSummary
        entries={0}
        studentIds={[]}
        attendanceIds={[]}
        present={new Map()}
        attended={new Map()}
        ready
        onReviewMusic={() => {}}
      />
    );
    expect(html).toContain("0 / 0");
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain("Checking");
  });
});
