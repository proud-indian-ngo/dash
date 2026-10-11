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
          city: "bangalore",
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

  it("documents the settings and run report endpoints", () => {
    expect(spec.paths["/api/social/v1/settings"].get.security).toEqual([
      { bearer: ["events:read"] },
    ]);
    expect(spec.paths["/api/social/v1/runs"].post.security).toEqual([
      { bearer: ["social:write"] },
    ]);
    expect(spec.components.schemas.SocialSettings.required.sort()).toEqual([
      "paused",
      "pausedKinds",
      "rules",
    ]);
    const rules = spec.components.schemas.SocialSettings.properties.rules as {
      additionalProperties: boolean;
      properties: Record<
        string,
        { properties: Record<string, Record<string, unknown>> }
      >;
    };
    expect(rules.additionalProperties).toBe(false);
    expect(Object.keys(rules.properties).sort()).toEqual([
      "impact",
      "recap",
      "schedule",
      "story",
      "volunteerCall",
    ]);
    expect(rules.properties.schedule?.properties.minRows).toMatchObject({
      default: 3,
      maximum: 6,
      minimum: 1,
      type: "integer",
    });
    expect(rules.properties.recap?.properties.held?.default).toBe(true);
    expect(spec.components.schemas.SocialRunInput.required).toHaveLength(11);
  });
});
