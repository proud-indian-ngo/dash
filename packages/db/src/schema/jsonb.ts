import { sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

/** Any value Postgres can hold in a jsonb column. */
export type JsonValue =
  | boolean
  | number
  | string
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/**
 * Parses a value read back from Postgres. Bun SQL already decodes jsonb, so
 * this only matters for a string: rows written before this column type
 * stored their JSON as a jsonb string, which Bun hands back as JSON text.
 */
function fromJsonb(value: unknown): JsonValue {
  if (typeof value !== "string") {
    return value as JsonValue;
  }
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return value;
  }
}

/**
 * A jsonb column for the Bun SQL driver. Drizzle's built-in `jsonb` hands the
 * driver `JSON.stringify(value)`, and Bun, seeing a jsonb parameter, encodes
 * that string again, so objects land as jsonb strings. Zero syncs the raw
 * column, so clients then get a string where they expect an object. Sending
 * the JSON as text and casting it in SQL stores the real value.
 */
export const jsonb = customType<{ data: JsonValue; driverData: unknown }>({
  dataType: () => "jsonb",
  fromDriver: fromJsonb,
  toDriver: (value) => sql`${JSON.stringify(value)}::text::jsonb`,
});
