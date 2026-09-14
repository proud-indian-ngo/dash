import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "../../fixtures/test";
import { profileZeroQueries } from "../../helpers/zero-performance";
import { KalakritiScanPage } from "../../pages/kalakriti-scan-page";

const execFileAsync = promisify(execFile);

test("profile a large synthetic Kalakriti edition", async ({
  page,
  browser,
  kalakritiActors,
}, info) => {
  test.skip(
    process.env.KALAKRITI_PERFORMANCE !== "true" ||
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
    scopedCounts: { students: number; entries: number };
    scopedCenterIds: string[];
  };
  const dashboardProfile = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(
        import.meta.dirname,
        "../../helpers/profile-kalakriti-dashboard.ts"
      ),
    ],
    { env: process.env, timeout: 60_000 }
  );
  const dashboard = JSON.parse(dashboardProfile.stdout.trim()) as {
    scope: string;
    samples: {
      elapsedMs: number;
      totals: { entries: number; students: number };
    }[];
  }[];
  const editionSamples = dashboard.find(
    (result) => result.scope === "edition"
  )?.samples;
  expect(editionSamples).toHaveLength(3);
  for (const sample of editionSamples ?? []) {
    expect(sample.totals.entries).toBe(fixture.counts.entries!);
    expect(sample.totals.students).toBe(fixture.counts.students!);
  }
  await page.goto(`/kalakriti/${fixture.year}`);
  await expect(
    page.getByRole("heading", { name: "Edition overview", exact: true })
  ).toBeVisible();
  const minimumRows: Record<string, number> = {
    "kalakritiFood.memberships": fixture.counts.memberships!,
    "kalakritiFood.students": fixture.counts.students!,
    "kalakritiStudent.visibleForDirectory": fixture.counts.students!,
    "kalakritiEntry.visible": fixture.counts.entries!,
    "kalakritiEntry.availableDivisions": fixture.counts.divisions!,
    "kalakritiGuardian.roster": fixture.counts.memberships! / 2,
    "kalakritiAssignment.roster": fixture.counts.memberships! / 2,
    "kalakritiCenter.visible": fixture.counts.centers!,
    "kalakritiStudent.visibleForCompliance": fixture.counts.students!,
    "kalakritiCompetition.categories": 1,
    "kalakritiCompetition.competitions": fixture.counts.competitions!,
    "kalakritiCompetition.sessions": fixture.counts.sessions!,
    "kalakritiCompetition.venues": 1,
  };
  const results = [];
  for (const [route, names] of [
    ["food", ["kalakritiFood.memberships", "kalakritiFood.students"]],
    ["students", ["kalakritiStudent.visibleForDirectory"]],
    ["guardians", ["kalakritiGuardian.roster"]],
    ["volunteers", ["kalakritiAssignment.roster"]],
    [
      "centers",
      ["kalakritiCenter.visible", "kalakritiStudent.visibleForCompliance"],
    ],
    [
      "competitions",
      [
        "kalakritiCompetition.categories",
        "kalakritiCompetition.competitions",
        "kalakritiCompetition.sessions",
        "kalakritiCompetition.venues",
      ],
    ],
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
        { editionId: fixture.editionId }
      ))
    );
  }
  for (const kind of ["guest", "judge"] as const) {
    await page.goto(`/kalakriti/${fixture.year}/${kind}s`);
    results.push(
      ...(
        await profileZeroQueries(
          page,
          { "kalakritiAttendee.visible": fixture.counts.attendees! / 2 },
          { editionId: fixture.editionId, kind },
          {
            "kalakritiAttendee.visible": {
              table: "kalakriti_attendee",
              count: fixture.counts.attendees! / 2,
            },
          }
        )
      ).map((result) => ({ ...result, kind }))
    );
  }
  const centerId = fixture.scopedCenterIds[0]!;
  const transportExpected = {
    "kalakritiTransport.byCenter":
      fixture.counts.transport! / fixture.counts.centers!,
  };
  const transportVerification = {
    "kalakritiTransport.byCenter": {
      table: "kalakriti_transport_assignment",
      count: transportExpected["kalakritiTransport.byCenter"],
      centerIds: [centerId],
    },
  };
  await page.goto(`/kalakriti/${fixture.year}/centers/${centerId}`);
  results.push(
    ...(await profileZeroQueries(
      page,
      transportExpected,
      { editionId: fixture.editionId, centerId },
      transportVerification
    ))
  );
  const scan = new KalakritiScanPage(page);
  await scan.open("Performance Center 1");
  results.push(
    ...(await profileZeroQueries(
      page,
      { "kalakritiCenterScan.byCenter": 1 },
      { editionId: fixture.editionId, centerId },
      {
        "kalakritiCenterScan.byCenter": { table: "kalakriti_center", count: 1 },
      }
    ))
  );
  await page.keyboard.press("Escape");
  const scopedResults = [];
  for (const actor of ["guardian", "liaison"] as const) {
    const context = await browser.newContext({
      storageState:
        kalakritiActors[actor === "guardian" ? "unrelatedVolunteer" : "liaison"]
          .storageState!,
    });
    try {
      const scopedPage = await context.newPage();
      for (const [route, expected] of [
        [
          "students",
          {
            "kalakritiStudent.visibleForDirectory":
              fixture.scopedCounts.students,
          },
        ],
        ["entries", { "kalakritiEntry.visible": fixture.scopedCounts.entries }],
        [
          "food",
          {
            "kalakritiFood.students": fixture.scopedCounts.students,
            "kalakritiFood.memberships": 90,
          },
        ],
      ] as [string, Record<string, number>][]) {
        await scopedPage.goto(`/kalakriti/${fixture.year}/${route}`);
        const tables: Record<string, string> = {
          "kalakritiStudent.visibleForDirectory": "kalakriti_student",
          "kalakritiEntry.visible": "kalakriti_competition_entry",
          "kalakritiFood.students": "kalakriti_student",
          "kalakritiFood.memberships": "kalakriti_edition_membership",
        };
        const verification = Object.fromEntries(
          Object.entries(expected).map(([name, count]) => [
            name,
            {
              table: tables[name]!,
              count,
              centerIds:
                name === "kalakritiFood.memberships"
                  ? undefined
                  : fixture.scopedCenterIds,
            },
          ])
        );
        const analyses = await profileZeroQueries(
          scopedPage,
          expected,
          {
            editionId: fixture.editionId,
          },
          verification
        );
        scopedResults.push({ actor, route, queries: analyses });
      }
      await scopedPage.goto(`/kalakriti/${fixture.year}/centers/${centerId}`);
      scopedResults.push({
        actor,
        route: "center-transport",
        queries: await profileZeroQueries(
          scopedPage,
          transportExpected,
          { editionId: fixture.editionId, centerId },
          transportVerification
        ),
      });
      if (actor === "liaison") {
        const scopedScan = new KalakritiScanPage(scopedPage);
        await scopedScan.open("Performance Center 1");
        scopedResults.push({
          actor,
          route: "center-scan",
          queries: await profileZeroQueries(
            scopedPage,
            { "kalakritiCenterScan.byCenter": 1 },
            { editionId: fixture.editionId, centerId },
            {
              "kalakritiCenterScan.byCenter": {
                table: "kalakriti_center",
                count: 1,
              },
            }
          ),
        });
      }
    } finally {
      await context.close();
    }
  }
  await info.attach("kalakriti-performance.json", {
    body: JSON.stringify(
      { fixture, dashboard, results, scopedResults },
      null,
      2
    ),
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
