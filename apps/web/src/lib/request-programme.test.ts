import { describe, expect, it } from "bun:test";

import { requestProgrammeId, requestProgrammeName } from "./request-programme";

describe("request programme", () => {
  it("takes the programme from the request's event", () => {
    const event = { programme: { name: "Education" }, programmeId: "p-1" };
    expect(requestProgrammeId(event)).toBe("p-1");
    expect(requestProgrammeName(event)).toBe("Education");
  });

  it("buckets requests without an event as No event", () => {
    expect(requestProgrammeId(undefined)).toBe("no-event");
    expect(requestProgrammeName(undefined)).toBe("No event");
  });

  it("leaves the name empty while the event's programme loads", () => {
    expect(requestProgrammeName({ programme: undefined })).toBe("");
  });
});
