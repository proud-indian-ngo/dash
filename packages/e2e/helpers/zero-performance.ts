import type { Page } from "@playwright/test";

import { expect, waitForZeroReady } from "../fixtures/test";

interface Analysis {
  elapsed: number;
  readRowCount: number;
  syncedRowCount: number;
  dbScansByQuery: Record<string, Record<string, number>>;
  readRowCountsByQuery: Record<string, Record<string, number>>;
  sqlitePlans: Record<string, string[]>;
}

interface InspectorQuery {
  name: string;
  got: boolean;
  rowCount: number;
  args: { editionId?: string }[] | null;
  hydrateServer: number | null;
  hydrateTotal: number | null;
  analyze: () => Promise<Analysis>;
}

type InspectorWindow = typeof window & {
  __zero: {
    inspector: {
      authenticate: (password: string) => Promise<boolean>;
      client: { queries: () => Promise<InspectorQuery[]> };
    };
  };
};

export async function profileZeroQueries(
  page: Page,
  expected: Record<string, number>,
  editionId?: string
) {
  await waitForZeroReady(page);
  expect(
    await page.evaluate(
      (password) =>
        (window as InspectorWindow).__zero.inspector.authenticate(password),
      process.env.ZERO_ADMIN_PASSWORD ?? ""
    )
  ).toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(
          async ({ expected, editionId }) => {
            const queries = await (
              window as InspectorWindow
            ).__zero.inspector.client.queries();
            return Object.entries(expected).every(([name, minimum]) =>
              queries.some(
                (query) =>
                  query.name === name &&
                  query.got &&
                  query.rowCount >= minimum &&
                  (editionId === undefined ||
                    query.args?.some((arg) => arg.editionId === editionId))
              )
            );
          },
          { expected, editionId }
        ),
      { timeout: 60_000 }
    )
    .toBe(true);
  const results = [];
  for (const name of Object.keys(expected)) {
    const result = await page.evaluate(
      async ({ name, editionId }) => {
        const queries = await (
          window as InspectorWindow
        ).__zero.inspector.client.queries();
        const query = queries.find(
          (item) =>
            item.name === name &&
            (editionId === undefined ||
              item.args?.some((arg) => arg.editionId === editionId))
        );
        if (!query) throw new Error(`Missing query: ${name}`);
        const samples = [];
        for (let sample = 0; sample < 3; sample++) {
          const analysis = await query.analyze();
          // Omit syncedRows: reports contain diagnostics, not records.
          samples.push({
            elapsedMs: analysis.elapsed,
            readRows: analysis.readRowCount,
            syncedRows: analysis.syncedRowCount,
            scans: analysis.dbScansByQuery,
            reads: analysis.readRowCountsByQuery,
            plans: analysis.sqlitePlans,
          });
        }
        return {
          name,
          serverMs: query.hydrateServer,
          totalMs: query.hydrateTotal,
          samples,
        };
      },
      { name, editionId }
    );
    expect(result.samples[0]!.syncedRows).toBeGreaterThan(0);
    results.push(result);
  }
  return results;
}
