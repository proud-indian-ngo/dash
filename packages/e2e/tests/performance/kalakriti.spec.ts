import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "../../fixtures/test";
import { profileZeroQueries } from "../../helpers/zero-performance";

const execFileAsync = promisify(execFile);

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
    results.push(
      ...(await profileZeroQueries(
        page,
        Object.fromEntries(names.map((name) => [name, minimumRows[name]!])),
        fixture.editionId
      ))
    );
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
