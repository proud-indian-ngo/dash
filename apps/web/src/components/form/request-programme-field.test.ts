import { describe, expect, it } from "bun:test";

import { programmeAfterEventChange } from "./request-programme-field";

describe("programmeAfterEventChange", () => {
  it("fills an empty programme from the picked event", () => {
    expect(
      programmeAfterEventChange({
        current: undefined,
        nextEventProgrammeId: "education",
        previousEventProgrammeId: undefined,
      })
    ).toBe("education");
  });

  it("follows the event while the programme still matches the previous event", () => {
    expect(
      programmeAfterEventChange({
        current: "arts",
        nextEventProgrammeId: "education",
        previousEventProgrammeId: "arts",
      })
    ).toBe("education");
  });

  it("keeps a programme the user chose", () => {
    expect(
      programmeAfterEventChange({
        current: "community",
        nextEventProgrammeId: "education",
        previousEventProgrammeId: "arts",
      })
    ).toBe("community");
  });

  it("keeps the programme when the event is cleared", () => {
    expect(
      programmeAfterEventChange({
        current: "arts",
        nextEventProgrammeId: undefined,
        previousEventProgrammeId: "arts",
      })
    ).toBe("arts");
  });
});
