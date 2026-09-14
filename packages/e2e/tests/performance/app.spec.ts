import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "../../fixtures/test";
import { profileZeroQueries } from "../../helpers/zero-performance";

const execFileAsync = promisify(execFile);

test("profile Dashboard, Events and financial queries at scale", async ({
  page,
}, info) => {
  test.skip(
    process.env.APP_PERFORMANCE !== "true" ||
      info.project.name !== "super_admin",
    "Opt-in benchmark on the isolated test stack only"
  );
  test.setTimeout(300_000);
  const seed = () =>
    execFileAsync(
      "bun",
      [
        "run",
        path.resolve(
          import.meta.dirname,
          "../../helpers/seed-app-performance.ts"
        ),
      ],
      { env: process.env, timeout: 60_000 }
    );
  const fixture = JSON.parse((await seed()).stdout.trim()) as {
    counts: Record<string, number>;
  };
  expect(JSON.parse((await seed()).stdout.trim())).toEqual(fixture);
  const financial = {
    "reimbursement.all": fixture.counts.reimbursements!,
    "advancePayment.all": fixture.counts.advances!,
    "vendorPayment.all": fixture.counts.vendorPayments!,
  };
  const routes: [string, Record<string, number>][] = [
    [
      "/",
      {
        ...financial,
        "teamEvent.allAccessible": fixture.counts.events!,
        "teamEvent.byCurrentUserAll": fixture.counts.events!,
      },
    ],
    ["/events", { "teamEvent.allAccessible": fixture.counts.events! }],
    [
      "/reimbursements",
      {
        "reimbursement.all": fixture.counts.reimbursements!,
        "advancePayment.all": fixture.counts.advances!,
      },
    ],
    [
      "/vendor-payments",
      { "vendorPayment.all": fixture.counts.vendorPayments! },
    ],
    ["/vendors", { "vendor.all": fixture.counts.vendors! }],
  ];
  const results = [];
  for (const [route, queries] of routes) {
    const start = performance.now();
    await page.goto(route);
    const analyses = await profileZeroQueries(page, queries);
    results.push({
      route,
      navigationAndAnalysisMs: performance.now() - start,
      queries: analyses,
    });
  }
  await info.attach("app-performance.json", {
    body: JSON.stringify({ fixture, results }, null, 2),
    contentType: "application/json",
  });
  console.log(
    JSON.stringify(
      results.map(({ route, queries }) => ({
        route,
        queries: queries.map(({ name, samples }) => ({
          name,
          elapsedMs: samples.map((sample) => sample.elapsedMs),
          readRows: samples.map((sample) => sample.readRows),
          syncedRows: samples.map((sample) => sample.syncedRows),
        })),
      }))
    )
  );
});
