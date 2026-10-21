import { describe, expect, it } from "vitest";

import { PROGRAMME_IDS } from "./constants";
import {
  expenseChargeError,
  expenseProgrammeOf,
  isUnallocatedCharge,
  normaliseExpenseCharge,
} from "./expense-charge";

describe("expenseProgrammeOf", () => {
  it("takes the event's programme for an event charge, with no project", () => {
    expect(
      expenseProgrammeOf({
        chargedTo: "event",
        event: { programmeId: "edu" },
      })
    ).toEqual({ isAdmin: false, programmeId: "edu", projectId: null });
  });

  it("takes the event's project when it names one", () => {
    expect(
      expenseProgrammeOf({
        chargedProjectId: "ignored",
        chargedTo: "event",
        event: { programmeId: "edu", projectId: "class-2026" },
      })
    ).toEqual({ isAdmin: false, programmeId: "edu", projectId: "class-2026" });
  });

  it("is unknown while the event has not loaded", () => {
    expect(expenseProgrammeOf({ chargedTo: "event", event: null })).toEqual({
      isAdmin: false,
      programmeId: null,
      projectId: null,
    });
  });

  it("takes the chosen programme and project, ignoring any event", () => {
    expect(
      expenseProgrammeOf({
        chargedProgrammeId: "arts",
        chargedProjectId: "k3",
        chargedTo: "programme",
        event: { programmeId: "edu" },
      })
    ).toEqual({ isAdmin: false, programmeId: "arts", projectId: "k3" });
  });

  it("marks an organisation charge as admin, with no programme", () => {
    expect(expenseProgrammeOf({ chargedTo: "organisation" })).toEqual({
      isAdmin: true,
      programmeId: null,
      projectId: null,
    });
  });
});

describe("normaliseExpenseCharge", () => {
  it("clears the programme fields on an event charge", () => {
    expect(
      normaliseExpenseCharge({
        chargedProgrammeId: "edu",
        chargedProjectId: "p",
        chargedTo: "event",
        eventId: "ev",
      })
    ).toEqual({
      chargedProgrammeId: null,
      chargedProjectId: null,
      chargedTo: "event",
      eventId: "ev",
    });
  });

  it("drops a hidden event on a programme or admin charge", () => {
    expect(
      normaliseExpenseCharge({
        chargedProgrammeId: "edu",
        chargedTo: "programme",
        eventId: "ev",
      })
    ).toEqual({
      chargedProgrammeId: "edu",
      chargedProjectId: null,
      chargedTo: "programme",
      eventId: null,
    });
    expect(
      normaliseExpenseCharge({
        chargedProgrammeId: "edu",
        chargedTo: "organisation",
        eventId: "ev",
      })
    ).toEqual({
      chargedProgrammeId: null,
      chargedProjectId: null,
      chargedTo: "organisation",
      eventId: null,
    });
  });

  it("keeps the old behaviour for a client that sends no choice", () => {
    expect(normaliseExpenseCharge({ eventId: "ev" }).chargedTo).toBe("event");
    expect(normaliseExpenseCharge({})).toEqual({
      chargedProgrammeId: PROGRAMME_IDS.unallocated,
      chargedProjectId: null,
      chargedTo: "programme",
      eventId: null,
    });
  });

  it("does not invent a programme for an explicit programme choice", () => {
    expect(
      normaliseExpenseCharge({ chargedTo: "programme" }).chargedProgrammeId
    ).toBeNull();
  });
});

describe("expenseChargeError", () => {
  it("mirrors the database checks", () => {
    expect(
      expenseChargeError(normaliseExpenseCharge({ chargedTo: "event" }))
    ).toBe("Choose the event this was spent on");
    expect(
      expenseChargeError(normaliseExpenseCharge({ chargedTo: "programme" }))
    ).toBe("Choose the programme this was spent on");
    expect(
      expenseChargeError(normaliseExpenseCharge({ chargedTo: "organisation" }))
    ).toBeNull();
    expect(
      expenseChargeError(
        normaliseExpenseCharge({ chargedTo: "event", eventId: "ev" })
      )
    ).toBeNull();
  });
});

describe("isUnallocatedCharge", () => {
  it("is true only for the Unallocated holding programme", () => {
    expect(
      isUnallocatedCharge({
        chargedProgrammeId: PROGRAMME_IDS.unallocated,
        chargedTo: "programme",
      })
    ).toBe(true);
    expect(
      isUnallocatedCharge({ chargedProgrammeId: "edu", chargedTo: "programme" })
    ).toBe(false);
    expect(isUnallocatedCharge({ chargedTo: "organisation" })).toBe(false);
  });
});
