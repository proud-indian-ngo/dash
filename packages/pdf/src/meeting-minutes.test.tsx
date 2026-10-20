import { describe, expect, it } from "bun:test";

import {
  plainTextToRichText,
  serializeRichText,
} from "@pi-dash/shared/rich-text";

import { generateMeetingMinutesPdf } from "./meeting-minutes";
import { richSample } from "./rich-text.test-helper";

const props = {
  attendance: [
    { name: "Asha Rao", offices: "Managing Trustee", presence: "Present" },
    { name: "Vikram Menon", offices: "", presence: "On video" },
  ],
  authority: "Trust deed, version 2 (effective 1 Jan 2026)",
  chair: {
    name: "Asha Rao",
    offices: "Managing Trustee",
    trusteeId: "01930000-0000-7000-8000-000000000001",
  },
  heldOn: "2026-10-20",
  items: [
    {
      attendance: null,
      body: null,
      conflicted: [],
      noted: [{ number: "PI/TR/2026-27/001", title: "Bank signatories" }],
      notes: null,
      outcome: "Noted.",
      position: 1,
      title: "Circular resolutions passed since the last meeting, to be noted",
      votes: [],
    },
    {
      attendance: "For this item: Vikram Menon (absent).",
      body: serializeRichText(
        plainTextToRichText("RESOLVED THAT the budget for 2027-28 be approved.")
      ),
      conflicted: ["Vikram Menon"],
      noted: [],
      notes: "The treasurer presented the budget.",
      outcome: "Passed as PI/TR/2026-27/002 (1 for, 0 against).",
      position: 2,
      title: "Budget for 2027-28",
      votes: [{ choice: "For", name: "Asha Rao" }],
    },
  ],
  mode: "In person and video",
  notes: "The chair opened the meeting at 10:00.",
  noticeSentOn: "2026-10-10",
  org: { address: "Bengaluru 560016", name: "Proud Indian" },
  place: "Bengaluru office",
  reference: "M-0193ABCD",
  startsAt: "20 Oct 2026, 10:00",
  title: "Board meeting, October 2026",
};

describe("generateMeetingMinutesPdf", () => {
  it("renders the minutes and the chair's signature page", async () => {
    const pdf = await generateMeetingMinutesPdf(props);
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text.match(/\/Type \/Page\b/g)?.length).toBe(2);
  });

  it("draws a resolution's table, lists and marks", async () => {
    const [discussion, budget] = props.items;
    const pdf = await generateMeetingMinutesPdf({
      ...props,
      items: [discussion!, { ...budget!, body: richSample }],
    });
    const text = pdf.toString("latin1");
    expect(text).toMatch(/\/BaseFont \/[A-Z]{6}\+Geist-SemiBoldItalic\b/);
    expect(text.match(/\/Type \/Page\b/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("renders the same bytes twice", async () => {
    const [a, b] = await Promise.all([
      generateMeetingMinutesPdf(props),
      generateMeetingMinutesPdf(props),
    ]);
    expect(a.equals(b)).toBe(true);
  });
});
