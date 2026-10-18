import { describe, expect, it } from "bun:test";

import { publicationStatement, publicationTables } from "./publication";

describe("Zero replication publication", () => {
  it("publishes only public user columns and no authentication tables", () => {
    expect(publicationTables.find((table) => table.name === "user")).toEqual({
      columns: ["id", "image", "name", "role"],
      name: "user",
    });
    for (const name of ["account", "session", "verification"]) {
      expect(publicationTables.some((table) => table.name === name)).toBe(
        false
      );
    }
  });

  it("uses explicit server column names when creating or replacing the publication", () => {
    for (const exists of [false, true]) {
      const statement = publicationStatement(exists);
      expect(statement).toContain(
        'public."user" ("id", "image", "name", "role")'
      );
      expect(statement).toContain('public."team_event" (');
      expect(statement).toContain('public."budget" (');
      expect(statement).toContain('public."budget_line" (');
      expect(statement).toContain('"start_time"');
      expect(statement).not.toContain("FOR ALL TABLES");
      expect(statement).not.toContain("TABLES IN SCHEMA");
    }
  });
});
