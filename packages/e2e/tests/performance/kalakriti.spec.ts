import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { Page } from "@playwright/test";

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
    groupSize: number;
    editionId: string;
    eventId: string;
    categoryCount: number;
    categoryEntryIds: string[];
    year: number;
    counts: Record<string, number>;
    scopedCounts: { students: number; entries: number };
    scopedCenterIds: string[];
    firstDivisionId: string;
    firstSessionId: string;
  };
  const profileEditionPicker = (target: Page) =>
    profileZeroQueries(
      target,
      { "kalakritiEdition.accessible": 1 },
      undefined,
      {
        "kalakritiEdition.accessible": {
          table: "kalakriti_edition",
          rowFilter: { id: fixture.editionId },
          count: 1,
        },
      }
    );
  const profileEligibility = async (target: Page) => {
    await target.goto(`/kalakriti/${fixture.year}/eligibility`);
    return profileZeroQueries(
      target,
      { "kalakritiEligibility.ageCategories": 1 },
      { editionId: fixture.editionId },
      {
        "kalakritiEligibility.ageCategories": {
          table: "kalakriti_age_category",
          count: 1,
        },
      }
    );
  };
  const profileConfiguration = async (target: Page, restricted: boolean) => {
    await target.goto(`/events/${fixture.eventId}`);
    const linkedEdition = await profileZeroQueries(
      target,
      { "kalakritiEdition.byTeamEventId": 1 },
      { teamEventId: fixture.eventId },
      {
        "kalakritiEdition.byTeamEventId": {
          table: "kalakriti_edition",
          count: 1,
          ids: [fixture.editionId],
        },
      }
    );
    await target.goto(`/kalakriti/${fixture.year}`);
    const configuration = await profileZeroQueries(
      target,
      { "kalakritiEdition.cloneSource": 1 },
      { editionId: fixture.editionId },
      {
        "kalakritiEdition.cloneSource": {
          table: "kalakriti_edition",
          count: 1,
          ids: [fixture.editionId],
          relatedCounts: {
            kalakriti_age_category: 1,
            kalakriti_competition_category: fixture.categoryCount,
            kalakriti_competition: fixture.counts.competitions!,
            kalakriti_competition_division: fixture.counts.divisions!,
            kalakriti_venue: 1,
          },
        },
      }
    );
    // Global admin's list shares the accessible query AST and Inspector name.
    if (restricted) {
      configuration.push(
        ...(await profileZeroQueries(
          target,
          { "kalakritiEdition.configurationAccessible": 1 },
          undefined,
          {
            "kalakritiEdition.configurationAccessible": {
              table: "kalakriti_edition",
              rowFilter: { id: fixture.editionId },
              count: 1,
            },
          }
        ))
      );
    }
    configuration.push(...(await profileEditionPicker(target)));
    return [...linkedEdition, ...configuration];
  };
  const profileRegistration = async (target: Page, restricted: boolean) => {
    const centerId = fixture.scopedCenterIds[0]!;
    await target.goto(
      `/kalakriti/${fixture.year}/entries/${fixture.firstDivisionId}?center=${centerId}`
    );
    const students = restricted
      ? fixture.scopedCounts.students
      : fixture.counts.students!;
    const entries =
      (restricted ? fixture.scopedCounts.entries : fixture.counts.entries!) /
      fixture.counts.divisions!;
    return [
      ...(await profileZeroQueries(
        target,
        { "kalakritiStudent.visibleForEntries": students },
        { editionId: fixture.editionId },
        {
          "kalakritiStudent.visibleForEntries": {
            table: "kalakriti_student",
            count: students,
            centerIds: restricted ? fixture.scopedCenterIds : undefined,
          },
        }
      )),
      // Admin shares the availableDivisions AST/view, so this name is absent in Inspector.
      ...(restricted
        ? await profileZeroQueries(
            target,
            {
              "kalakritiEntry.availableDivisionsByCenter":
                fixture.counts.divisions!,
            },
            { editionId: fixture.editionId, centerId },
            {
              "kalakritiEntry.availableDivisionsByCenter": {
                table: "kalakriti_competition_division",
                count: fixture.counts.divisions!,
              },
            }
          )
        : []),
      ...(await profileZeroQueries(
        target,
        { "kalakritiEntry.visibleByDivision": entries },
        {
          editionId: fixture.editionId,
          divisionId: fixture.firstDivisionId,
          sessionId: fixture.firstSessionId,
        },
        {
          "kalakritiEntry.visibleByDivision": {
            table: "kalakriti_competition_entry",
            count: entries,
            centerIds: restricted ? fixture.scopedCenterIds : undefined,
          },
        }
      )),
    ];
  };
  const profileStudentLookups = async (
    target: Page,
    assignmentCount: number | null
  ) => [
    ...(await profileZeroQueries(
      target,
      { "kalakritiAssignment.myAccess": assignmentCount === null ? 0 : 1 },
      { editionId: fixture.editionId },
      assignmentCount === null
        ? undefined
        : {
            "kalakritiAssignment.myAccess": {
              table: "kalakriti_edition_membership",
              count: 1,
              relatedCounts: { kalakriti_assignment: assignmentCount },
            },
          }
    )),
    ...(await profileZeroQueries(
      target,
      { "kalakritiStudent.ageCategoriesByCenter": 1 },
      { editionId: fixture.editionId, centerId: fixture.scopedCenterIds[0]! },
      {
        "kalakritiStudent.ageCategoriesByCenter": {
          table: "kalakriti_age_category",
          count: 1,
        },
      }
    )),
  ];
  const profileStudentDetails = async (target: Page) => {
    await target
      .getByPlaceholder("Search Students...")
      .fill(`KAL-${fixture.year}-0001`);
    await target.getByText("Performance Student 1", { exact: true }).click();
    const sheet = target.getByRole("dialog", { name: "Performance Student 1" });
    await expect(sheet).toBeVisible();
    const centerId = fixture.scopedCenterIds[0]!;
    const expected = {
      "kalakritiStudent.visibleByCenter":
        fixture.counts.students! / fixture.counts.centers!,
      "kalakritiEntry.visibleByCenter":
        fixture.counts.entries! / fixture.counts.centers!,
    };
    const results = await profileZeroQueries(
      target,
      expected,
      { editionId: fixture.editionId, centerId },
      {
        "kalakritiStudent.visibleByCenter": {
          table: "kalakriti_student",
          count: expected["kalakritiStudent.visibleByCenter"],
          centerIds: [centerId],
        },
        "kalakritiEntry.visibleByCenter": {
          table: "kalakriti_competition_entry",
          count: expected["kalakritiEntry.visibleByCenter"],
          centerIds: [centerId],
        },
      }
    );
    await expect(sheet.getByRole("listitem")).toHaveCount(2);
    for (const name of [
      "Performance Competition 1",
      "Performance Competition 16",
    ]) {
      await expect(sheet.getByText(name, { exact: true })).toBeVisible();
    }
    await expect(
      sheet.getByText(fixture.groupSize === 1 ? "Individual" : "Group", {
        exact: true,
      })
    ).toHaveCount(2);
    await expect(sheet.getByText("At Event", { exact: true })).toBeVisible();
    await target.keyboard.press("Escape");
    await expect(sheet).not.toBeVisible();
    return results;
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
    "kalakritiCompetition.categories": fixture.categoryCount,
    "kalakritiCompetition.competitions": fixture.counts.competitions!,
    "kalakritiCompetition.sessions": fixture.counts.sessions!,
    "kalakritiCompetition.venues": 1,
  };
  const results = await profileZeroQueries(
    page,
    { "kalakritiEdition.readiness": 1 },
    { editionId: fixture.editionId },
    {
      "kalakritiEdition.readiness": {
        table: "kalakriti_edition",
        count: 1,
        relatedCounts: {
          kalakriti_center: fixture.counts.centers!,
          kalakriti_age_category: 1,
          kalakriti_competition_category: fixture.categoryCount,
          kalakriti_competition: fixture.counts.competitions!,
          kalakriti_competition_division: fixture.counts.divisions!,
          kalakriti_competition_session: fixture.counts.sessions!,
          kalakriti_venue: 1,
          // Three linked volunteers have four assignments; the two new leads have one each.
          kalakriti_assignment: 14,
          kalakriti_transport_assignment: fixture.counts.transport!,
        },
      },
    }
  );
  results.push(
    ...(await profileZeroQueries(
      page,
      { "kalakritiEdition.byYear": 1 },
      { year: fixture.year },
      { "kalakritiEdition.byYear": { table: "kalakriti_edition", count: 1 } }
    ))
  );
  results.push(...(await profileConfiguration(page, false)));
  results.push(...(await profileEligibility(page)));
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
        { editionId: fixture.editionId },
        route === "entries"
          ? {
              "kalakritiEntry.visible": {
                table: "kalakriti_competition_entry",
                count: fixture.counts.entries!,
                relatedCounts: {
                  kalakriti_entry_member: fixture.counts.entryMembers!,
                },
              },
            }
          : undefined
      ))
    );
    if (route === "centers") {
      results.push(
        ...(await profileZeroQueries(
          page,
          {
            "kalakritiCenter.guardianAssignments":
              fixture.counts.guardianCenters!,
            "kalakritiCenter.liaisonAssignments":
              fixture.counts.assignments! / 2,
          },
          { editionId: fixture.editionId },
          {
            "kalakritiCenter.guardianAssignments": {
              table: "kalakriti_guardian_center",
              count: fixture.counts.guardianCenters!,
            },
            "kalakritiCenter.liaisonAssignments": {
              table: "kalakriti_assignment",
              count: fixture.counts.assignments! / 2,
            },
          }
        ))
      );
    }
    if (route === "students") {
      results.push(...(await profileStudentLookups(page, null)));
      results.push(...(await profileStudentDetails(page)));
    }
  }
  results.push(...(await profileRegistration(page, false)));
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
  await page.goto(`/kalakriti/${fixture.year}/centers?centerId=${centerId}`);
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
              relatedCounts:
                name === "kalakritiEntry.visible"
                  ? { kalakriti_entry_member: count * fixture.groupSize }
                  : undefined,
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
        if (route === "students") {
          scopedResults.push({
            actor,
            route: "edition-picker",
            queries: await profileEditionPicker(scopedPage),
          });
          scopedResults.push({
            actor,
            route: "student-lookups",
            queries: await profileStudentLookups(
              scopedPage,
              actor === "guardian" ? 0 : 4
            ),
          });
          scopedResults.push({
            actor,
            route: "student-details",
            queries: await profileStudentDetails(scopedPage),
          });
          scopedResults.push({
            actor,
            route,
            queries: await profileZeroQueries(
              scopedPage,
              { "kalakritiEdition.byYear": 1 },
              { year: fixture.year },
              {
                "kalakritiEdition.byYear": {
                  table: "kalakriti_edition",
                  count: 1,
                },
              }
            ),
          });
        }
      }
      scopedResults.push({
        actor,
        route: "registration",
        queries: await profileRegistration(scopedPage, true),
      });
      await scopedPage.goto(
        `/kalakriti/${fixture.year}/centers?centerId=${centerId}`
      );
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
  for (const actor of ["editionAdmin", "volunteerCoordinator"] as const) {
    const context = await browser.newContext({
      storageState: kalakritiActors[actor].storageState!,
    });
    try {
      const managerPage = await context.newPage();
      await managerPage.goto(`/kalakriti/${fixture.year}/centers`);
      const expected = {
        "kalakritiCenter.liaisonAssignments": fixture.counts.assignments! / 2,
        ...(actor === "editionAdmin"
          ? {
              "kalakritiCenter.guardianAssignments":
                fixture.counts.guardianCenters!,
            }
          : {}),
      };
      scopedResults.push({
        actor,
        route: "centers",
        queries: await profileZeroQueries(
          managerPage,
          expected,
          { editionId: fixture.editionId },
          {
            "kalakritiCenter.liaisonAssignments": {
              table: "kalakriti_assignment",
              rowFilter: { responsibility: "liaison" },
              count: fixture.counts.assignments! / 2,
            },
            ...(actor === "editionAdmin"
              ? {
                  "kalakritiCenter.guardianAssignments": {
                    table: "kalakriti_guardian_center",
                    count: fixture.counts.guardianCenters!,
                  },
                }
              : {}),
          }
        ),
      });
      if (actor === "editionAdmin") {
        scopedResults.push({
          actor,
          route: "configuration",
          queries: await profileConfiguration(managerPage, true),
        });
        scopedResults.push({
          actor,
          route: "eligibility",
          queries: await profileEligibility(managerPage),
        });
        for (const [route, expectedQueries, tables] of [
          [
            "students",
            {
              "kalakritiStudent.visibleForDirectory": fixture.counts.students!,
            },
            { "kalakritiStudent.visibleForDirectory": "kalakriti_student" },
          ],
          [
            "entries",
            { "kalakritiEntry.visible": fixture.counts.entries! },
            { "kalakritiEntry.visible": "kalakriti_competition_entry" },
          ],
          [
            "food",
            {
              "kalakritiFood.students": fixture.counts.students!,
              "kalakritiFood.memberships": fixture.counts.memberships!,
            },
            {
              "kalakritiFood.students": "kalakriti_student",
              "kalakritiFood.memberships": "kalakriti_edition_membership",
            },
          ],
        ] as [string, Record<string, number>, Record<string, string>][]) {
          await managerPage.goto(`/kalakriti/${fixture.year}/${route}`);
          scopedResults.push({
            actor,
            route,
            queries: await profileZeroQueries(
              managerPage,
              expectedQueries,
              { editionId: fixture.editionId },
              Object.fromEntries(
                Object.entries(expectedQueries).map(([name, count]) => [
                  name,
                  {
                    table: tables[name]!,
                    count,
                    relatedCounts:
                      name === "kalakritiEntry.visible"
                        ? { kalakriti_entry_member: count * fixture.groupSize }
                        : undefined,
                  },
                ])
              )
            ),
          });
        }
      }
    } finally {
      await context.close();
    }
  }
  for (const actor of ["categoryLead", "overallEventsLead"] as const) {
    const context = await browser.newContext({
      storageState: kalakritiActors[actor].storageState!,
    });
    try {
      const target = await context.newPage();
      await target.goto(`/kalakriti/${fixture.year}/competitions/catalog`);
      scopedResults.push({
        actor,
        route: "catalog-eligibility",
        queries: await profileZeroQueries(
          target,
          { "kalakritiEligibility.ageCategories": 1 },
          { editionId: fixture.editionId },
          {
            "kalakritiEligibility.ageCategories": {
              table: "kalakriti_age_category",
              count: 1,
            },
          }
        ),
      });
      await target.goto(`/kalakriti/${fixture.year}/entries`);
      const entryCount =
        actor === "categoryLead"
          ? fixture.categoryEntryIds.length
          : fixture.counts.entries!;
      scopedResults.push({
        actor,
        route: "entries",
        queries: await profileZeroQueries(
          target,
          { "kalakritiEntry.visible": entryCount },
          { editionId: fixture.editionId },
          {
            "kalakritiEntry.visible": {
              table: "kalakriti_competition_entry",
              count: entryCount,
              relatedCounts: {
                kalakriti_entry_member: entryCount * fixture.groupSize,
              },
              ids:
                actor === "categoryLead" ? fixture.categoryEntryIds : undefined,
            },
          }
        ),
      });
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
