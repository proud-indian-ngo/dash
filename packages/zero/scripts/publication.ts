import type { TableSchema } from "@rocicorp/zero";
import type { SQL } from "bun";

import { schema } from "../src/schema";

export const ZERO_PUBLICATION = "pi_dash_public";

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

const tables: TableSchema[] = Object.values(schema.tables);

export const publicationTables = tables
  .map((table) => ({
    columns: Object.entries(table.columns)
      .map(([name, column]) => column.serverName ?? name)
      .sort(),
    name: table.serverName ?? table.name,
  }))
  .sort((left, right) => left.name.localeCompare(right.name));

export function publicationStatement(exists: boolean): string {
  const tableList = publicationTables
    .map(
      (table) =>
        `public.${quoteIdentifier(table.name)} (${table.columns.map(quoteIdentifier).join(", ")})`
    )
    .join(", ");
  return exists
    ? `ALTER PUBLICATION ${quoteIdentifier(ZERO_PUBLICATION)} SET TABLE ${tableList}`
    : `CREATE PUBLICATION ${quoteIdentifier(ZERO_PUBLICATION)} FOR TABLE ${tableList}`;
}

/** The publication, not the TypeScript schema, enforces column privacy. */
export async function prepareZeroPublication(sql: SQL): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${ZERO_PUBLICATION}, 0))`;
    const existing = await tx`
      SELECT 1 FROM pg_publication WHERE pubname = ${ZERO_PUBLICATION}
    `;
    const rows: {
      attnames: string[];
      schemaname: string;
      tablename: string;
    }[] = await tx`
        SELECT schemaname, tablename, attnames
        FROM pg_publication_tables
        WHERE pubname = ${ZERO_PUBLICATION}
      `;
    const current = rows
      .filter((row) => row.schemaname === "public")
      .map((row) => ({ columns: row.attnames.toSorted(), name: row.tablename }))
      .sort((left, right) => left.name.localeCompare(right.name));
    if (
      rows.length === current.length &&
      JSON.stringify(current) === JSON.stringify(publicationTables)
    ) {
      return;
    }
    await tx.unsafe(publicationStatement(existing.length > 0));
  });
}
