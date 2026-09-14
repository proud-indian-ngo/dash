import type { Page } from "@playwright/test";

import { expect, waitForZeroReady } from "../fixtures/test";

interface Analysis {
  elapsed: number;
  syncedRows?: Record<string, Record<string, unknown>[]>;
  joinPlans?: {
    type: string;
    totalCost?: number;
    nodeType?: string;
    node?: string;
    costEstimate?: {
      startupCost: number;
      scanEst: number;
      cost: number;
      returnedRows: number;
      selectivity: number;
    };
    joinStates?: { join: string; type: string }[];
  }[];
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
  analyze: (options: {
    joinPlans: boolean;
    syncedRows?: boolean;
  }) => Promise<Analysis>;
}

export type InspectorWindow = typeof window & {
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
  args?: Record<string, string>,
  verification?: Record<
    string,
    {
      table: string;
      count: number;
      centerIds?: string[];
      relatedCounts?: Record<string, number>;
    }
  >
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
      async ({ name, args, verify }) => {
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
          const analysis = await query.analyze({ joinPlans: true });
          // Omit syncedRows: reports contain diagnostics, not records.
          samples.push({
            elapsedMs: analysis.elapsed,
            readRows: analysis.readRowCount,
            syncedRows: analysis.syncedRowCount,
            scans: analysis.dbScansByQuery,
            reads: analysis.readRowCountsByQuery,
            plans: analysis.sqlitePlans,
            // Planner filters/constraints can contain values; retain only costs and structure.
            joins: analysis.joinPlans
              ?.filter(
                (event) =>
                  event.type === "best-plan-selected" ||
                  event.type === "node-cost"
              )
              .map((event) => ({
                type: event.type,
                totalCost: event.totalCost,
                nodeType: event.nodeType,
                node: event.node,
                costEstimate: event.costEstimate,
                joinStates: event.joinStates,
              })),
          });
        }
        let verifiedScope;
        if (verify) {
          // A separate untimed analysis verifies scope; never return record contents.
          const syncedRows = (
            await query.analyze({ joinPlans: false, syncedRows: true })
          ).syncedRows;
          const rows = syncedRows?.[verify.table];
          if (!rows) throw new Error(`Missing verified table: ${verify.table}`);
          verifiedScope = {
            count: rows.length,
            relatedCounts: verify.relatedCounts
              ? Object.fromEntries(
                  Object.keys(verify.relatedCounts).map((table) => [
                    table,
                    syncedRows?.[table]?.length ?? 0,
                  ])
                )
              : undefined,
            outsideCenters: verify.centerIds
              ? rows.filter(
                  (row) => !verify.centerIds!.includes(String(row.center_id))
                ).length
              : 0,
          };
        }
        return {
          name,
          inspectorRows: query.rowCount,
          verifiedScope,
          serverMs: query.hydrateServer,
          totalMs: query.hydrateTotal,
          samples,
        };
      },
      { name, args, verify: verification?.[name] }
    );
    if (expected[name] === 0) {
      expect(result.inspectorRows).toBe(0);
      expect(result.samples[0]!.syncedRows).toBe(0);
    } else {
      expect(result.samples[0]!.syncedRows).toBeGreaterThan(0);
    }
    if (verification?.[name]) {
      expect(result.verifiedScope?.count).toBe(verification[name]!.count);
      expect(result.verifiedScope?.outsideCenters).toBe(0);
      if (verification[name]!.relatedCounts) {
        expect(result.verifiedScope?.relatedCounts).toEqual(
          verification[name]!.relatedCounts
        );
      }
    }
    results.push(result);
  }
  return results;
}
