import { describe, expect, it } from "vitest";

import { normalisePublicCityCode, requestCostCentreId } from "./cost-centre";

describe("requestCostCentreId", () => {
  it("takes the event's cost centre, never the request's own, when it has an event", () => {
    expect(
      requestCostCentreId({
        costCentreId: "own",
        event: { costCentreId: "event" },
        eventId: "e1",
      })
    ).toBe("event");
    // Not loaded yet: unknown, not the request's own.
    expect(requestCostCentreId({ costCentreId: "own", eventId: "e1" })).toBe(
      null
    );
  });

  it("takes its own without an event", () => {
    expect(requestCostCentreId({ costCentreId: "own", eventId: null })).toBe(
      "own"
    );
    expect(requestCostCentreId({})).toBeNull();
  });
});

describe("normalisePublicCityCode", () => {
  it("upper-cases codes and maps the deprecated aliases to BLR", () => {
    expect(normalisePublicCityCode("blr")).toBe("BLR");
    expect(normalisePublicCityCode(" Bangalore ")).toBe("BLR");
    expect(normalisePublicCityCode("bengaluru")).toBe("BLR");
    // Mumbai is no alias: its centre is inactive, so the feed refuses it.
    expect(normalisePublicCityCode("mumbai")).toBe("MUMBAI");
  });
});
