import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const execFileAsync = promisify(execFile);

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

test("profile a large synthetic Kalakriti edition", async ({ page }, info) => {
  test.skip(
    process.env.KALAKRITI_PERFORMANCE !== "true" ||
      info.project.name !== "super_admin",
    "Opt-in benchmark on the isolated test stack only"
  );
  test.setTimeout(180_000);
  const seed = () =>
    execFileAsync(
      "bun",
      [
        "run",
        path.resolve(
          import.meta.dirname,
          "../../helpers/seed-kalakriti-performance.ts"
        ),
      ],
      { env: process.env, timeout: 60_000 }
    );
  const { stdout } = await seed();
  expect(JSON.parse((await seed()).stdout.trim())).toEqual(
    JSON.parse(stdout.trim())
  );
  const fixture = JSON.parse(stdout.trim()) as {
    editionId: string;
    year: number;
    counts: Record<string, number>;
  };
  const minimumRows: Record<string, number> = {
    "kalakritiFood.memberships": fixture.counts.memberships!,
    "kalakritiFood.students": fixture.counts.students!,
    "kalakritiStudent.visibleForDirectory": fixture.counts.students!,
    "kalakritiEntry.visible": fixture.counts.entries!,
    "kalakritiEntry.availableDivisions": fixture.counts.divisions!,
  };
  const results = [];
  for (const [route, names] of [
    ["food", ["kalakritiFood.memberships", "kalakritiFood.students"]],
    ["students", ["kalakritiStudent.visibleForDirectory"]],
    [
      "entries",
      ["kalakritiEntry.visible", "kalakritiEntry.availableDivisions"],
    ],
  ] as const) {
    await page.goto(`/kalakriti/${fixture.year}/${route}`);
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
            async ({ expected, editionId, minimumRows }) => {
              const queries = await (
                window as InspectorWindow
              ).__zero.inspector.client.queries();
              return expected.every((name) =>
                queries.some(
                  (query) =>
                    query.name === name &&
                    query.got &&
                    query.rowCount >= minimumRows[name]! &&
                    query.args?.some((arg) => arg.editionId === editionId)
                )
              );
            },
            { expected: [...names], editionId: fixture.editionId, minimumRows }
          ),
        { timeout: 60_000 }
      )
      .toBe(true);
    for (const name of names) {
      const result = await page.evaluate(
        async ({ queryName, editionId }) => {
          const queries = await (
            window as InspectorWindow
          ).__zero.inspector.client.queries();
          const query = queries.find(
            (item) =>
              item.name === queryName &&
              item.args?.some((arg) => arg.editionId === editionId)
          );
          if (!query) throw new Error(`Missing query: ${queryName}`);
          const samples = [];
          for (let sample = 0; sample < 3; sample++) {
            const analysis = await query.analyze();
            // Explicitly omit syncedRows: reports contain diagnostics, not records.
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
            name: queryName,
            serverMs: query.hydrateServer,
            totalMs: query.hydrateTotal,
            samples,
          };
        },
        { queryName: name, editionId: fixture.editionId }
      );
      expect(result.samples[0]!.syncedRows).toBeGreaterThan(0);
      results.push(result);
    }
  }
  await info.attach("kalakriti-performance.json", {
    body: JSON.stringify({ fixture, results }, null, 2),
    contentType: "application/json",
  });
  console.log(
    JSON.stringify(
      results.map(({ name, samples }) => ({
        name,
        elapsedMs: samples.map((sample) => sample.elapsedMs),
        readRows: samples[0]!.readRows,
        syncedRows: samples[0]!.syncedRows,
      }))
    )
  );
});
