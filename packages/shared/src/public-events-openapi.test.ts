import { describe, expect, it } from "vitest";

import {
  buildPublicEvents,
  PUBLIC_EVENTS_MAX_DAYS,
  type PublicEventSourceRow,
} from "./public-events";
import { buildPublicEventsOpenApi } from "./public-events-openapi";

const BASE_URL = "https://dash.proudindian.ngo";
const NOW = Date.UTC(2026, 9, 8);
const DAY = 24 * 60 * 60 * 1000;

interface Schema {
  properties: Record<
    string,
    { enum?: string[]; maxLength?: number; type: string }
  >;
  required: string[];
}

const spec = buildPublicEventsOpenApi(`${BASE_URL}/`);
const eventSchema = spec.components.schemas.PublicEvent as unknown as Schema;

function row(overrides: Partial<PublicEventSourceRow>): PublicEventSourceRow {
  return {
    cancelledAt: null,
    city: "bangalore",
    description: "Help children with maths. ".repeat(20),
    endTime: null,
    id: "019a0000-0000-7000-8000-000000000001",
    isPublic: true,
    managementDomain: null,
    name: "Maths class",
    originalDate: null,
    publicArea: "Iblur",
    recurrenceRule: null,
    seriesId: null,
    startTime: NOW + 2 * DAY,
    teamName: "Education",
    ...overrides,
  };
}

/** The checks of the PublicEvent schema this feed relies on: keys, types, enums and lengths. */
function violations(event: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const key of eventSchema.required) {
    if (!(key in event)) {
      problems.push(`missing ${key}`);
    }
  }
  for (const [key, value] of Object.entries(event)) {
    const prop = eventSchema.properties[key];
    if (!prop) {
      problems.push(`unexpected ${key}`);
    } else if (typeof value !== prop.type) {
      problems.push(`${key} is not a ${prop.type}`);
    } else if (prop.enum && !prop.enum.includes(value as string)) {
      problems.push(`${key} "${value}" is not in the enum`);
    } else if (prop.maxLength && (value as string).length > prop.maxLength) {
      problems.push(`${key} is longer than ${prop.maxLength}`);
    }
  }
  return problems;
}

describe("buildPublicEventsOpenApi", () => {
  it("points at the origin it is served from", () => {
    expect(spec.servers).toEqual([{ url: BASE_URL }]);
  });

  it("describes what the feed actually returns", () => {
    const events = buildPublicEvents(
      [
        row({ id: "with-programme" }),
        row({ id: "no-programme", teamName: "Ops" }),
        row({ city: "mumbai", id: "mumbai", publicArea: null }),
      ],
      { city: "bangalore", from: NOW, limit: 20, to: NOW + 30 * DAY },
      BASE_URL
    );

    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(violations({ ...event })).toEqual([]);
    }
  });

  it("only makes programme optional", () => {
    expect(
      Object.keys(eventSchema.properties).filter(
        (key) => !eventSchema.required.includes(key)
      )
    ).toEqual(["programme"]);
  });

  it("takes its limits from the feed's constants", () => {
    const days = spec.paths["/api/public/events"].get.parameters.find(
      (p) => p.name === "days"
    );
    expect(days?.schema).toMatchObject({ maximum: PUBLIC_EVENTS_MAX_DAYS });
  });
});
