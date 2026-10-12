import { PgDialect, pgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { jsonb } from "./jsonb";

const probe = pgTable("probe", { value: jsonb("value") });
const column = probe.value;

describe("jsonb column", () => {
  it("sends JSON text cast to jsonb, so Bun SQL can't encode it twice", () => {
    const driverValue = column.mapToDriverValue({ rrule: "FREQ=WEEKLY" });
    const query = new PgDialect().sqlToQuery(
      driverValue as Parameters<PgDialect["sqlToQuery"]>[0]
    );
    expect(query.sql).toBe("$1::text::jsonb");
    expect(query.params).toEqual(['{"rrule":"FREQ=WEEKLY"}']);
  });

  it("returns values Bun already decoded as they are", () => {
    expect(column.mapFromDriverValue({ a: 1 })).toEqual({ a: 1 });
    expect(column.mapFromDriverValue([10, 60])).toEqual([10, 60]);
  });

  it("parses JSON text left by rows written before the fix", () => {
    expect(column.mapFromDriverValue('{"rrule":"FREQ=WEEKLY"}')).toEqual({
      rrule: "FREQ=WEEKLY",
    });
  });

  it("keeps a plain string that isn't JSON", () => {
    expect(column.mapFromDriverValue("hello")).toBe("hello");
  });
});
