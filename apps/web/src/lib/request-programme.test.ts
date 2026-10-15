import { describe, expect, it } from "bun:test";

import {
  requestProgrammeId,
  requestProgrammeName,
  requestProgrammeOptionId,
} from "./request-programme";

describe("request programme", () => {
  it("takes the programme from the event for an event charge", () => {
    const request = {
      chargedTo: "event" as const,
      event: { programme: { name: "Education" }, programmeId: "p-1" },
    };
    expect(requestProgrammeId(request)).toBe("p-1");
    expect(requestProgrammeName(request)).toBe("Education");
  });

  it("takes the chosen programme for a request without an event", () => {
    const request = {
      chargedProgramme: { name: "Arts and culture" },
      chargedProgrammeId: "p-2",
      chargedTo: "programme" as const,
      event: null,
    };
    expect(requestProgrammeId(request)).toBe("p-2");
    expect(requestProgrammeName(request)).toBe("Arts and culture");
  });

  it("shows an organisation charge as Admin", () => {
    const request = { chargedTo: "organisation" as const };
    expect(requestProgrammeId(request)).toBe("admin");
    expect(requestProgrammeName(request)).toBe("Admin");
    expect(requestProgrammeOptionId(request)).toBe("admin");
  });

  it("leaves the name empty while the programme loads", () => {
    expect(
      requestProgrammeName({
        chargedTo: "event",
        event: { programme: undefined },
      })
    ).toBe("");
    expect(
      requestProgrammeOptionId({
        chargedProgrammeId: "p-2",
        chargedTo: "programme",
      })
    ).toBeUndefined();
  });

  it("leaves legacy advances, which are charged to nothing, out of every bucket", () => {
    expect(requestProgrammeId({})).toBeNull();
    expect(requestProgrammeName({})).toBe("");
    expect(requestProgrammeOptionId({})).toBeUndefined();
  });
});
