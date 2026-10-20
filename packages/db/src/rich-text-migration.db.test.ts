import { readFileSync } from "node:fs";
import path from "node:path";

import { plainTextToRichText } from "@pi-dash/shared/rich-text";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

/**
 * Migration 0176 turns plain-text resolution bodies into rich text in SQL;
 * `plainTextToRichText` does the same in JavaScript. This runs the migration
 * on fixtures in a temporary `resolution` table (it shadows the real one for
 * the transaction, which is rolled back) and compares the two.
 * Opt in with RESOLUTIONS_DB_TEST=1 and DATABASE_URL pointing at a local
 * database, as for `resolutions.db.test.ts`.
 */

const enabled =
  process.env.RESOLUTIONS_DB_TEST === "1" &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1):\d+\//.test(
    process.env.DATABASE_URL ?? ""
  );

const FIXTURES: Record<string, string> = {
  blankLineWithSpace: "first\n \nsecond",
  bom: "﻿RESOLVED THAT﻿\n\nsecond﻿",
  crlf: "RESOLVED THAT\r\nit continues.\r\n\r\nRESOLVED FURTHER THAT",
  edges: "\n\n\n  leading and trailing  \n\n\n",
  empty: "",
  nbsp: " RESOLVED THAT \n \nsecond ",
  spacesOnly: " \t \n\n \r\n ",
  tabs: "\tRESOLVED THAT\t\n\t\tcontinues\t\n\t\n\tsecond",
  verticalTabAndFormFeed: "one\u000B\n\u000C\ntwo",
};

const MIGRATION = readFileSync(
  path.join(
    import.meta.dirname,
    "migrations/0176_resolution_body_rich_text.sql"
  ),
  "utf8"
);

class Rollback extends Error {}

describe.skipIf(!enabled)("migration 0176 and plainTextToRichText", () => {
  it("make the same paragraphs from every fixture", async () => {
    const { db } = await import(".");
    let rows: { body: string; id: string }[] = [];
    await db
      .transaction(async (tx) => {
        await tx.execute(
          sql`CREATE TEMP TABLE resolution (id text PRIMARY KEY, body text NOT NULL) ON COMMIT DROP`
        );
        for (const [id, body] of Object.entries(FIXTURES)) {
          await tx.execute(
            sql`INSERT INTO pg_temp.resolution (id, body) VALUES (${id}, ${body})`
          );
        }
        await tx.execute(sql.raw(MIGRATION));
        rows = (await tx.execute(
          sql`SELECT id, body FROM pg_temp.resolution`
        )) as unknown as { body: string; id: string }[];
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) {
          throw error;
        }
      });
    expect(rows).toHaveLength(Object.keys(FIXTURES).length);
    for (const row of rows) {
      expect({ id: row.id, value: JSON.parse(row.body) }).toEqual({
        id: row.id,
        value: plainTextToRichText(FIXTURES[row.id] ?? ""),
      });
    }
  });
});
