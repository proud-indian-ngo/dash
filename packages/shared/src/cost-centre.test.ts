import { describe, expect, it } from "vitest";

import {
  activeCostCentres,
  costCentrePickerOptions,
  defaultCostCentreId,
  normalisePublicCityCode,
  requestCostCentreId,
} from "./cost-centre";

const BLR = { active: true, code: "BLR", id: "blr", name: "Bangalore" };
const MUM = { active: false, code: "MUM", id: "mum", name: "Mumbai" };
const DEL = { active: true, code: "DEL", id: "del", name: "Delhi" };

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

describe("pickers", () => {
  it("offer active centres by name, plus a record's own inactive one", () => {
    expect(activeCostCentres([MUM, BLR, DEL])).toEqual([BLR, DEL]);
    expect(costCentrePickerOptions([MUM, BLR], "mum")).toEqual([BLR, MUM]);
    expect(costCentrePickerOptions([MUM, BLR], "blr")).toEqual([BLR]);
  });

  it("default to the only active centre", () => {
    expect(defaultCostCentreId([BLR, MUM])).toBe("blr");
    expect(defaultCostCentreId([BLR, MUM, DEL])).toBeNull();
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
