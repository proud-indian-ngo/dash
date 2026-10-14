import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { pendingInterestOfStartedEvent } from "./event-interest-expiry";

describe("pendingInterestOfStartedEvent", () => {
  it("selects only pending interests of events started by now", () => {
    const now = new Date("2026-10-13T18:30:00Z");
    const condition = pendingInterestOfStartedEvent(now);
    if (!condition) {
      throw new Error("Expected a condition");
    }
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.sql).toContain('"event_interest"."status" =');
    expect(query.sql).toContain('"event_interest"."event_id" in (select');
    expect(query.sql).toContain('"team_event"."start_time" <=');
    expect(query.params).toEqual(["pending", now.toISOString()]);
  });
});
