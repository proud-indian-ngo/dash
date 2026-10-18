import { describe, expect, it } from "bun:test";

import { schema } from "./schema";

describe("synced user privacy", () => {
  it("exposes only public identity fields through every user relation", () => {
    expect(Object.keys(schema.tables.user.columns).sort()).toEqual([
      "id",
      "image",
      "name",
      "role",
    ]);
  });

  it("does not expose authentication credentials or sessions", () => {
    for (const table of ["account", "session", "verification"]) {
      expect(schema.tables).not.toHaveProperty(table);
    }
  });
});
