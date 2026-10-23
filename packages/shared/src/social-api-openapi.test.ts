import { describe, expect, it } from "vitest";

import { buildSocialEvents, parseSocialEventsWindow } from "./social-api";
import { buildSocialApiOpenApi } from "./social-api-openapi";

const spec = buildSocialApiOpenApi("https://dash.proudindian.ngo/");

describe("buildSocialApiOpenApi", () => {
  it("describes exactly the fields a social event has", () => {
    const [event] = buildSocialEvents(
      [
        {
          cancelledAt: null,
          childrenAttended: null,
          city: "BLR",
          cityActive: true,
          cityName: "Bangalore",
          description: null,
          endTime: null,
          id: "e1",
          isPublic: true,
          managementDomain: null,
          name: "Class",
          originalDate: null,
          publicArea: null,
          recurrenceRule: null,
          seriesId: null,
          socialCompletedAt: null,
          socialNotes: null,
          startTime: Date.parse("2026-10-03T10:00:00+05:30"),
          teamName: "Teach",
          volunteersNeeded: null,
        },
      ],
      parseSocialEventsWindow(
        new URLSearchParams({ from: "2026-10-01", to: "2026-10-31" })
      ),
      "https://dash.proudindian.ngo",
      new Map()
    );
    const schema = spec.components.schemas.SocialEvent;

    expect(schema.required.sort()).toEqual(Object.keys(event ?? {}).sort());
  });

  it("requires a bearer scope on every operation and serves from the origin", () => {
    for (const path of Object.values(spec.paths)) {
      for (const operation of Object.values(path)) {
        expect(operation.security.length).toBeGreaterThan(0);
      }
    }
    expect(spec.servers).toEqual([{ url: "https://dash.proudindian.ngo" }]);
  });
});
