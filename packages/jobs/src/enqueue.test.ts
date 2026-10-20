import { describe, expect, it } from "bun:test";

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { inTransaction } from "./enqueue";

describe("inTransaction", () => {
  it("runs pg-boss's numbered parameters through the transaction", async () => {
    const queries: { params: unknown[]; sql: string }[] = [];
    const tx = {
      execute: async (query: SQL) => {
        const { params, sql } = new PgDialect().sqlToQuery(query);
        queries.push({ params, sql });
        return [{ id: "job-1" }];
      },
    };
    const result = await inTransaction(tx).executeSql(
      "SELECT $2::int, x FROM json_to_recordset($1::text::json) WHERE y = $2",
      ['[{"a":1}]', 7]
    );
    expect(result.rows).toEqual([{ id: "job-1" }]);
    expect(queries).toEqual([
      {
        params: [7, '[{"a":1}]', 7],
        sql: "SELECT $1::int, x FROM json_to_recordset($2::text::json) WHERE y = $3",
      },
    ]);
  });

  it("binds an array cast as one array of parameters", async () => {
    const queries: { params: unknown[]; sql: string }[] = [];
    const tx = {
      execute: async (query: SQL) => {
        queries.push(new PgDialect().sqlToQuery(query));
        return [];
      },
    };
    await inTransaction(tx).executeSql(
      "DELETE FROM job WHERE name = $1 AND id = ANY($2::uuid[])",
      ["q", ["a", "b"]]
    );
    expect(queries[0]?.params).toEqual(["q", "a", "b"]);
    expect(queries[0]?.sql).toContain("ANY(ARRAY[$2,$3]::uuid[])");
  });
});
