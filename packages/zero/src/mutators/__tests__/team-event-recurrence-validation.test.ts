import { describe, expect, it, mock } from "bun:test";

import { defineMutators } from "@rocicorp/zero";

import { teamEventMutators } from "../team-event";

const mutators = defineMutators({ teamEvent: teamEventMutators });

const validArgs = {
  id: "event-1",
  name: "Weekly session",
  now: Date.UTC(2026, 0, 1),
  startTime: Date.UTC(2026, 0, 2),
  teamId: "team-1",
};

describe("team event recurrence validation", () => {
  it.each([
    ["sub-daily frequency", { rrule: "FREQ=SECONDLY" }],
    ["zero interval", { rrule: "FREQ=DAILY;INTERVAL=0" }],
    ["negative interval", { rrule: "FREQ=DAILY;INTERVAL=-1" }],
    ["non-finite interval", { rrule: "FREQ=DAILY;INTERVAL=Infinity" }],
    [
      "compound recurrence set",
      { rrule: "RRULE:FREQ=WEEKLY\nRRULE:FREQ=DAILY" },
    ],
    ["multiple times per date", { rrule: "FREQ=DAILY;BYHOUR=9,10" }],
    [
      "unsafe exclusion rule",
      { excludeRules: ["FREQ=MINUTELY"], rrule: "FREQ=WEEKLY" },
    ],
  ])("rejects %s before the create transaction runs", async (_name, rule) => {
    const insert = mock();

    await expect(
      mutators.teamEvent.create.fn({
        args: { ...validArgs, recurrenceRule: rule },
        ctx: { permissions: ["events.create"], userId: "user-1" },
        tx: { mutate: { teamEvent: { insert } } },
      } as never)
    ).rejects.toThrow();

    expect(insert).not.toHaveBeenCalled();
  });

  it("accepts the UI's DTSTART, interval, count and monthly exclusion shape", async () => {
    const validator = teamEventMutators.create.validator;
    if (!validator) {
      throw new Error("Expected the create mutator to validate input");
    }

    const result = await validator["~standard"].validate({
      ...validArgs,
      recurrenceRule: {
        excludeRules: ["FREQ=MONTHLY;BYDAY=SA;BYSETPOS=3"],
        exdates: ["2026-04-11"],
        rrule:
          "DTSTART:20260404T100000Z\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SA;COUNT=8",
      },
    });

    expect(result).toEqual({
      value: {
        ...validArgs,
        recurrenceRule: {
          excludeRules: ["FREQ=MONTHLY;BYDAY=SA;BYSETPOS=3"],
          exdates: ["2026-04-11"],
          rrule:
            "DTSTART:20260404T100000Z\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SA;COUNT=8",
        },
      },
    });
  });
});
