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
  args: Record<string, unknown>[] | null;
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
  args?: Record<string, string>
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
          async ({ expected, args }) => {
            const queries = await (
              window as InspectorWindow
            ).__zero.inspector.client.queries();
            return Object.entries(expected).every(([name, minimum]) =>
              queries.some(
                (query) =>
                  query.name === name &&
                  query.got &&
                  query.rowCount >= minimum &&
                  (args === undefined ||
                    query.args?.some((arg) =>
                      Object.entries(args).every(
                        ([key, value]) => arg[key] === value
                      )
                    ))
              )
            );
          },
          { expected, args }
        ),
      { timeout: 60_000 }
    )
    .toBe(true);
  const results = [];
  for (const name of Object.keys(expected)) {
    const result = await page.evaluate(
      async ({ name, args }) => {
        const queries = await (
          window as InspectorWindow
        ).__zero.inspector.client.queries();
        const query = queries.find(
          (item) =>
            item.name === name &&
            (args === undefined ||
              item.args?.some((arg) =>
                Object.entries(args).every(([key, value]) => arg[key] === value)
              ))
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
          rootRows: query.rowCount,
          serverMs: query.hydrateServer,
          totalMs: query.hydrateTotal,
          samples,
        };
      },
      { name, args }
    );
    if (expected[name] === 0) {
      expect(result.rootRows).toBe(0);
      expect(result.samples[0]!.syncedRows).toBe(0);
    } else {
      expect(result.samples[0]!.syncedRows).toBeGreaterThan(0);
    }
    results.push(result);
  }
  return results;
}
