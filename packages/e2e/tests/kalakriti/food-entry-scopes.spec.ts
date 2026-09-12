import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { uuidv7 } from "uuidv7";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { KalakritiPersonQrPage } from "../../pages/kalakriti-person-qr-page";
import { KalakritiScanPage } from "../../pages/kalakriti-scan-page";
import { KalakritiStudentsPage } from "../../pages/kalakriti-students-page";

test.use({
  storageState: path.resolve(
    import.meta.dirname,
    "../../.auth/super_admin.json"
  ),
});
const execFileAsync = promisify(execFile);
interface Setup {
  year: number;
  foreignEditionId: string;
  yearlyGuardianEmail: string;
  editionId: string;
  centerId: string;
  ageCategoryId: string;
  centerB: string;
  centerC: string;
  studentId: string;
  extraStudentA: string;
  studentB: string;
  studentC: string;
  scopeVolunteerA: string;
  volunteerId: string;
  secondVolunteerId: string;
  scopeVolunteerC: string;
  scopeGuardianId: string;
  scopeGuardianB: string;
  scopeGuardianEmail: string;
  scopeGuardianPassword: string;
  entryC: string;
  divisionId: string;
  creationDivisionId: string;
  groupDivisionId: string;
  sessionId: string;
  sessionStartAt: number;
  secondSessionId: string;
  groupSessionId: string;
  outsideDivisionId: string;
}
async function fixture<T>(action: string, ...args: string[]): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(
        import.meta.dirname,
        "../../helpers/kalakriti-station-subject.ts"
      ),
      action,
      ...args,
    ],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}
async function mutate(
  request: APIRequestContext,
  name: string,
  args: Record<string, unknown>
) {
  const id = uuidv7();
  const response = await request.post(
    "/api/zero/mutate?schema=zero_0&appID=zero",
    {
      data: {
        clientGroupID: `scope-${id}`,
        requestID: id,
        pushVersion: 1,
        timestamp: Date.now(),
        mutations: [
          {
            args: [args],
            clientID: id,
            id: 1,
            name,
            timestamp: Date.now(),
            type: "custom",
          },
        ],
      },
    }
  );
  expect(response.ok()).toBe(true);
  const body = await response.json();
  return body.mutations[0].result as { error?: string };
}
function operation(
  data: Setup,
  type: string,
  id: string,
  personType = "student"
) {
  const now = Date.now();
  return {
    editionId: data.editionId,
    type,
    personQr: JSON.stringify({ id, type: personType }),
    id: uuidv7(),
    operationId: uuidv7(),
    auditEntryId: uuidv7(),
    now,
    occurredAt: now,
  };
}
function filterUrl(
  pathname: string,
  field: string,
  value: string | number | readonly string[],
  operator = "is"
) {
  const filters = {
    id: "root",
    type: "group",
    combinator: "and",
    rules: [
      {
        id: "scope-filter",
        type: "rule",
        path: [field],
        operator: field === "centers" ? "has_any_of" : operator,
        value:
          field === "centers" && typeof value === "string" ? [value] : value,
      },
    ],
  };
  return `${pathname}?filters=${encodeURIComponent(JSON.stringify(filters))}`;
}
const rowFor = (page: Page, name: string) =>
  page.getByRole("row").filter({ has: page.getByText(name, { exact: true }) });
async function cell(page: Page, row: Locator, header: string) {
  const index = await page
    .getByRole("columnheader", { name: header })
    .evaluate((node) => (node as HTMLTableCellElement).cellIndex);
  return row.getByRole("cell").nth(index);
}
async function foodPerson(
  page: Page,
  name: string,
  visible = true,
  query = name
) {
  const search = page.getByPlaceholder("Search people...");
  if (!visible) {
    await search.fill("");
    await expect(page.getByRole("table").getByRole("row").nth(1)).toBeVisible();
  }
  await search.fill(query);
  await expect(rowFor(page, name)).toHaveCount(visible ? 1 : 0);
  if (visible)
    await expect(
      (await cell(page, rowFor(page, name), "Breakfast")).getByRole("img", {
        name: /^(Served|Not served)$/,
      })
    ).toBeVisible();
  else
    await expect(
      page.getByText("No eligible people in your Food scope.", {
        exact: true,
      })
    ).toBeVisible();
}
function watchOutsideCenter(page: Page) {
  let leaked = false;
  page.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      if (payload.toString().includes("Outside Center C")) leaked = true;
    })
  );
  return () =>
    expect(
      leaked,
      "Scoped Zero responses must not expose the shared person's outside Center name"
    ).toBe(false);
}
const foodCount = (page: Page, label: string) =>
  page.getByText(label, { exact: true }).locator("..").getByRole("definition");
async function gotoFood(page: Page, year: number, role?: string) {
  const pathname = `/kalakriti/${year}/food`;
  await page.goto(role ? filterUrl(pathname, "role", role) : pathname);
  await expect(
    page.getByRole("heading", { name: "Food", exact: true })
  ).toBeVisible();
  await waitForZeroReady(page);
}
async function finish(
  request: APIRequestContext,
  data: Setup,
  expectedStage: string
) {
  expect(
    (
      await mutate(request, "kalakritiCenterScan.finalize", {
        editionId: data.editionId,
        centerId: data.centerId,
        expectedStage,
        id: uuidv7(),
        auditEntryId: uuidv7(),
        now: Date.now(),
      })
    ).error
  ).toBeUndefined();
}

test("Food and Entry readers see their two-Center union, while arrival and check-in statuses track effective operations", async ({
  page,
  browser,
  baseURL,
  superAdminEmail,
  kalakritiActors,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "kalakriti_release_invariants",
    "Isolated LIVE scope fixture uses the serialized invariant lane"
  );
  test.slow();
  const data = await fixture<Setup>("setup-scopes", superAdminEmail);
  const guardianContext = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const liaisonContext = await browser.newContext({
    baseURL,
    storageState: kalakritiActors.unrelatedVolunteer.storageState,
  });
  const foodContext = await browser.newContext({
    baseURL,
    storageState: kalakritiActors.categoryLead.storageState,
  });
  try {
    const guardian = await guardianContext.newPage();
    const expectGuardianWireScoped = watchOutsideCenter(guardian);
    await guardian.goto("/login");
    await guardian.getByLabel("Email").fill(data.scopeGuardianEmail);
    await guardian.getByLabel("Password").fill(data.scopeGuardianPassword);
    await guardian.getByRole("button", { name: "Login", exact: true }).click();
    await guardian.waitForURL((url) => url.pathname !== "/login");
    const liaison = await liaisonContext.newPage();
    const expectLiaisonWireScoped = watchOutsideCenter(liaison);
    const food = await foodContext.newPage();
    await gotoFood(page, data.year);
    await expect(
      page.getByRole("columnheader", { name: "Eligibility" })
    ).toHaveCount(0);
    await foodPerson(page, "Activity Student", false);
    await foodPerson(page, "Center A Volunteer", false);
    for (const id of [
      data.studentId,
      data.extraStudentA,
      data.studentB,
      data.studentC,
    ]) {
      expect(
        (
          await mutate(
            page.request,
            "kalakritiOperation.record",
            operation(data, "pickup", id)
          )
        ).error
      ).toBeUndefined();
    }
    for (const id of [
      data.volunteerId,
      data.secondVolunteerId,
      data.scopeVolunteerC,
    ]) {
      expect(
        (
          await mutate(
            page.request,
            "kalakritiOperation.record",
            operation(data, "volunteer_check_in", id, "volunteer")
          )
        ).error
      ).toBeUndefined();
    }
    await page.goto(`/kalakriti/${data.year}/volunteers`);
    await waitForZeroReady(page);
    await page
      .getByPlaceholder("Search volunteers...")
      .fill("Center A Volunteer");
    await expect(
      (
        await cell(page, rowFor(page, "Center A Volunteer"), "Checked in")
      ).getByRole("img", { name: "Not checked in", exact: true })
    ).toBeVisible();
    expect(
      (
        await mutate(
          page.request,
          "kalakritiOperation.record",
          operation(
            data,
            "volunteer_check_in",
            data.scopeVolunteerA,
            "volunteer"
          )
        )
      ).error
    ).toBeUndefined();
    await expect(
      (
        await cell(page, rowFor(page, "Center A Volunteer"), "Checked in")
      ).getByRole("img", { name: "Checked in", exact: true })
    ).toBeVisible();
    await expect(
      (
        await cell(page, rowFor(page, "Center A Volunteer"), "Checked in")
      ).getByRole("button")
    ).toHaveCount(0);

    for (const reader of [page, food]) {
      await gotoFood(reader, data.year);
      for (const name of [
        "Activity Student",
        "Union Student B",
        "Outside Student C",
        "Activity Volunteer",
        "Outside Volunteer",
        "Outside Guardian",
      ])
        await foodPerson(reader, name);
      for (const name of ["Center A Volunteer", "Center B Guardian"]) {
        await foodPerson(reader, name);
        await expect(
          await cell(reader, rowFor(reader, name), "Center")
        ).toContainText("Outside Center C");
      }
      await expect(
        reader.getByRole("button", { name: "Record meal", exact: true })
      ).toHaveCount(0);
    }
    for (const reader of [guardian, liaison]) {
      await gotoFood(reader, data.year);
      for (const name of [
        "Activity Student",
        "Another Center A Student",
        "Union Student B",
        "Center A Volunteer",
        "Second Activity Volunteer",
        "Union Guardian",
        "Center B Guardian",
      ])
        await foodPerson(reader, name);
      await foodPerson(reader, "Center A Volunteer");
      await expect(
        await cell(reader, rowFor(reader, "Center A Volunteer"), "Center")
      ).toHaveText("Activity Center");
      await foodPerson(reader, "Center B Guardian");
      await expect(
        await cell(reader, rowFor(reader, "Center B Guardian"), "Center")
      ).toHaveText("Union Center B");
      for (const name of [
        "Outside Student C",
        "Outside Volunteer",
        "Outside Guardian",
        "Activity Volunteer",
      ])
        await foodPerson(
          reader,
          name,
          false,
          name === "Activity Volunteer" ? "KALV-2168-0001" : name
        );
      await expect(
        reader.getByRole("button", { name: "Scan", exact: true })
      ).toHaveCount(reader === guardian ? 0 : 1);
    }
    for (const [role, included, excluded] of [
      ["student", "Union Student B", "Union Guardian"],
      ["volunteer", "Center A Volunteer", "Union Student B"],
      ["guardian", "Union Guardian", "Center A Volunteer"],
    ] as const) {
      await gotoFood(page, data.year, role);
      await foodPerson(page, included);
      await foodPerson(page, excluded, false);
    }
    await gotoFood(food, data.year, "guardian");
    await foodPerson(food, "Union Guardian");
    await expect(
      (await cell(food, rowFor(food, "Union Guardian"), "Breakfast")).getByRole(
        "img",
        { name: "Not served", exact: true }
      )
    ).toBeVisible();
    expect(
      (
        await mutate(
          food.request,
          "kalakritiOperation.record",
          operation(data, "breakfast", data.scopeGuardianId, "guardian")
        )
      ).error
    ).toBeUndefined();
    await expect(
      (await cell(food, rowFor(food, "Union Guardian"), "Breakfast")).getByRole(
        "img",
        { name: "Served", exact: true }
      )
    ).toBeVisible();
    await expect(foodCount(food, "Breakfast served")).toHaveText("1");
    const registered = Number(
      await foodCount(food, "Registered people").textContent()
    );
    expect(
      (
        await mutate(
          food.request,
          "kalakritiOperation.record",
          operation(data, "lunch", data.scopeGuardianB, "guardian")
        )
      ).error
    ).toBeUndefined();
    for (const [field, value, operator, included, excluded] of [
      [
        "name",
        "Union Guardian",
        "contains",
        "Union Guardian",
        "Center B Guardian",
      ],
      [
        "humanId",
        data.scopeGuardianId,
        "contains",
        "Union Guardian",
        "Center B Guardian",
      ],
      ["centers", data.centerId, "is", "Union Guardian", "Union Student B"],
      ["centers", data.centerB, "is", "Union Guardian", "Center A Volunteer"],
      ["centers", data.centerC, "is", "Center A Volunteer", "Union Guardian"],
      [
        "centers",
        [data.centerId, data.centerC],
        "has_any_of",
        "Outside Guardian",
        "Union Student B",
      ],
      [
        "centers",
        "unassigned",
        "has_any_of",
        "Activity Volunteer",
        "Union Guardian",
      ],
      ["breakfast", "Served", "is", "Union Guardian", "Center B Guardian"],
      ["breakfast", "Not served", "is", "Center B Guardian", "Union Guardian"],
      ["lunch", "Served", "is", "Center B Guardian", "Union Guardian"],
      ["lunch", "Not served", "is", "Union Guardian", "Center B Guardian"],
    ] as const) {
      await test.step(`Food filter ${field} ${operator} ${value}`, async () => {
        await page.goto(
          filterUrl(`/kalakriti/${data.year}/food`, field, value, operator)
        );
        await waitForZeroReady(page);
        await foodPerson(page, included);
        await foodPerson(page, excluded, false);
        await expect(foodCount(page, "Breakfast served")).toHaveText("1");
        await expect(foodCount(page, "Lunch served")).toHaveText("1");
      });
    }
    const beforeSelfMutation = await fixture("state");
    expect(
      (
        await mutate(
          guardian.request,
          "kalakritiOperation.record",
          operation(data, "lunch", data.scopeGuardianId, "guardian")
        )
      ).error
    ).toBeDefined();
    expect(await fixture("state")).toEqual(beforeSelfMutation);

    for (const reader of [guardian, liaison]) {
      await reader.goto(`/kalakriti/${data.year}/entries`);
      await waitForZeroReady(reader);
      await expect(
        reader.getByRole("combobox", { name: "Center", exact: true })
      ).toHaveCount(0);
      const event = reader.getByRole("row").filter({
        has: reader.getByRole("link", {
          name: "Station Singing",
          exact: true,
        }),
      });
      await expect(
        reader.getByRole("columnheader", { name: /Center|Arrival/ })
      ).toHaveCount(0);
      await expect(
        event.getByRole("cell", { name: "3", exact: true })
      ).toBeVisible();
      await event
        .getByRole("link", { name: "Station Singing", exact: true })
        .click();
      await expect(
        reader.getByRole("heading", { name: "Station Singing", exact: true })
      ).toBeVisible();
      for (const name of [
        "Activity Student",
        "Another Center A Student",
        "Union Student B",
      ])
        await expect(rowFor(reader, name)).toBeVisible();
      await expect(
        reader.getByText("Outside Student C", { exact: true })
      ).toHaveCount(0);
      await reader.goto(
        filterUrl(
          `/kalakriti/${data.year}/entries/${data.divisionId}`,
          "center",
          "Union Center B"
        )
      );
      await expect(rowFor(reader, "Union Student B")).toBeVisible();
      await expect(rowFor(reader, "Activity Student")).toHaveCount(0);
      await reader.goto(
        `/kalakriti/${data.year}/entries/${data.outsideDivisionId}`
      );
      await expect(
        reader.getByText("No Entries have been registered for this Session.", {
          exact: true,
        })
      ).toBeVisible();
      await expect(
        reader.getByText("Outside Student C", { exact: true })
      ).toHaveCount(0);
      await reader.goto(`/kalakriti/${data.year}/centers/${data.centerC}`);
      await expect(
        reader.getByRole("heading", { name: "Center not found", exact: true })
      ).toBeVisible();
      expect(
        (
          await mutate(reader.request, "kalakritiEntry.updateMusic", {
            entryId: data.entryC,
            auditEntryId: uuidv7(),
            now: Date.now(),
            music: [],
            removeMusicFileIds: [],
          })
        ).error
      ).toBeDefined();
    }
    expectGuardianWireScoped();
    expectLiaisonWireScoped();
    await guardian.goto(`/kalakriti/${data.year}/entries/${data.divisionId}`);
    await liaison.goto(
      `/kalakriti/${data.year}/entries/${data.groupDivisionId}`
    );
    await expect(
      rowFor(guardian, "Activity Student").getByRole("img", {
        name: "Activity Student: Not present",
        exact: true,
      })
    ).toBeVisible();
    await expect(
      rowFor(liaison, "Activity Student").getByText("0 / 2 present", {
        exact: true,
      })
    ).toBeVisible();
    for (const id of [data.studentId, data.extraStudentA])
      expect(
        (
          await mutate(
            page.request,
            "kalakritiOperation.record",
            operation(data, "pickup", id)
          )
        ).error
      ).toBeUndefined();
    await finish(page.request, data, "pickup");
    expect(
      (
        await mutate(
          page.request,
          "kalakritiOperation.record",
          operation(data, "venue_arrival", data.studentId)
        )
      ).error
    ).toBeUndefined();
    await expect(
      rowFor(guardian, "Activity Student").getByRole("img", {
        name: "Activity Student: Present",
        exact: true,
      })
    ).toBeVisible();
    await expect(
      rowFor(liaison, "Activity Student").getByText("1 / 2 present", {
        exact: true,
      })
    ).toBeVisible();
    await page.goto(
      filterUrl(
        `/kalakriti/${data.year}/entries/${data.groupDivisionId}`,
        "present",
        "partial"
      )
    );
    await expect(
      rowFor(page, "Activity Student").getByText("1 / 2 present", {
        exact: true,
      })
    ).toBeVisible();
    expect(
      (
        await mutate(
          page.request,
          "kalakritiOperation.record",
          operation(data, "venue_arrival", data.extraStudentA)
        )
      ).error
    ).toBeUndefined();
    await finish(page.request, data, "venue_arrival");
    expect(
      (
        await mutate(page.request, "kalakritiOperation.record", {
          ...operation(data, "competition_attendance", data.studentId),
          sessionId: data.secondSessionId,
        })
      ).error
    ).toBeUndefined();
    await expect(
      (
        await cell(guardian, rowFor(guardian, "Activity Student"), "Attended")
      ).getByRole("img", {
        name: "Activity Student: Not attended",
        exact: true,
      })
    ).toBeVisible();
    await expect(
      rowFor(liaison, "Activity Student").getByText("0 / 2 attended", {
        exact: true,
      })
    ).toBeVisible();
    expect(
      (
        await mutate(page.request, "kalakritiOperation.record", {
          ...operation(data, "competition_attendance", data.studentId),
          sessionId: data.sessionId,
        })
      ).error
    ).toBeUndefined();
    await expect(
      (
        await cell(guardian, rowFor(guardian, "Activity Student"), "Attended")
      ).getByRole("img", { name: "Activity Student: Attended", exact: true })
    ).toBeVisible();
    for (const [index, studentId] of [
      data.studentId,
      data.extraStudentA,
    ].entries()) {
      expect(
        (
          await mutate(page.request, "kalakritiOperation.record", {
            ...operation(data, "competition_attendance", studentId),
            sessionId: data.groupSessionId,
          })
        ).error
      ).toBeUndefined();
      await expect(
        rowFor(liaison, "Activity Student").getByText(
          `${index + 1} / 2 attended`,
          { exact: true }
        )
      ).toBeVisible();
      if (index === 0) {
        await page.goto(
          filterUrl(
            `/kalakriti/${data.year}/entries/${data.groupDivisionId}`,
            "attended",
            "partial"
          )
        );
        await expect(
          rowFor(page, "Activity Student").getByText("1 / 2 attended", {
            exact: true,
          })
        ).toBeVisible();
      }
    }
    for (const stage of ["venue_departure", "drop_off"]) {
      for (const id of [data.studentId, data.extraStudentA])
        expect(
          (
            await mutate(
              page.request,
              "kalakritiOperation.record",
              operation(data, stage, id)
            )
          ).error
        ).toBeUndefined();
      await finish(page.request, data, stage);
    }
    await expect(
      rowFor(guardian, "Activity Student").getByRole("img", {
        name: "Activity Student: Present",
        exact: true,
      })
    ).toBeVisible();
    await expect(
      rowFor(liaison, "Activity Student").getByText("2 / 2 present", {
        exact: true,
      })
    ).toBeVisible();
    const operations = await fixture<{ type: string }[]>("state");
    expect(
      operations.filter((row) => row.type === "competition_attendance")
    ).toHaveLength(4);
    await expect(
      rowFor(liaison, "Activity Student").getByText("2 / 2 attended", {
        exact: true,
      })
    ).toBeVisible();
    await expect(
      (
        await cell(guardian, rowFor(guardian, "Activity Student"), "Present")
      ).getByRole("img", { name: "Activity Student: Present", exact: true })
    ).toBeVisible();
    for (const [field, value, operator, count] of [
      ["center", ["Activity Center", "Union Center B"], "is_any_of", 3],
      ["center", "Union Center B", "is", 1],
      ["present", "all", "is", 2],
      ["present", "none", "is", 1],
      ["attended", "all", "is", 1],
      ["attended", "none", "is", 2],
      ["studentId", "KAL-2168-0002", "contains", 1],
      ["student", "Another Center A Student", "contains", 1],
      ["participationMode", "individual", "is", 3],
      ["participationMode", "group", "is", 0],
      ["ageCategory", "Junior", "is", 3],
      ["session", data.sessionStartAt, "is", 3],
      ["venue", "Station Hall", "is", 3],
    ] as const) {
      await test.step(`Entry filter ${field} ${operator} ${value}`, async () => {
        await guardian.goto(
          filterUrl(
            `/kalakriti/${data.year}/entries/${data.divisionId}`,
            field,
            value,
            operator
          )
        );
        await waitForZeroReady(guardian);
        const entries = guardian.getByRole("row").filter({
          has: guardian.getByRole("cell").filter({ hasText: "KAL-2168-" }),
        });
        await expect(entries).toHaveCount(count);
        if (count === 0)
          await expect(
            guardian.getByText(
              "No Entries have been registered for this Session.",
              { exact: true }
            )
          ).toBeVisible();
      });
    }
    await fixture("archive-scoped-guardian");
    await foodPerson(food, "Union Guardian", false);
    await expect(foodCount(food, "Registered people")).toHaveText(
      String(registered - 1)
    );
    await expect(foodCount(food, "Breakfast served")).toHaveText("1");
    expect(
      (
        await mutate(
          food.request,
          "kalakritiOperation.record",
          operation(data, "lunch", data.scopeGuardianId, "guardian")
        )
      ).error
    ).toBeDefined();
    expect(await fixture("state")).toEqual(operations);
    await fixture("open-scope-registration");
    await page.goto(
      `/kalakriti/${data.year}/entries/${data.creationDivisionId}`
    );
    await waitForZeroReady(page);
    for (const [center, included, excluded] of [
      ["Activity Center", "Another Center A Student", "Union Student B"],
      ["Union Center B", "Union Student B", "Another Center A Student"],
    ] as const) {
      await page
        .getByRole("button", { name: "Register Entry", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Register Competition Entries",
        exact: true,
      });
      await expect(
        dialog.getByText("Choose Center", { exact: true })
      ).toBeVisible();
      await expect(
        dialog.getByRole("combobox", { name: /^Students(?:\s*\*)?$/ })
      ).toHaveCount(0);
      await dialog.getByLabel("Center", { exact: true }).click();
      await page.getByRole("option", { name: center, exact: true }).click();
      await expect(
        dialog.getByText(`Center: ${center}`, { exact: true })
      ).toBeVisible();
      const students = dialog.getByRole("combobox", {
        name: /^Students(?:\s*\*)?$/,
      });
      await students.fill(included, { timeout: 10_000 });
      const option = page.getByRole("option", { name: new RegExp(included) });
      await expect(option).toBeVisible();
      await expect(option).toBeEnabled();
      await students.fill(excluded, { timeout: 10_000 });
      await expect(
        page.getByText("No matching Students found.", { exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("option", { name: new RegExp(excluded) })
      ).toHaveCount(0);
      await students.press("Escape", { timeout: 10_000 });
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toBeHidden();
    }
  } finally {
    await Promise.allSettled(
      [guardianContext, liaisonContext, foodContext].map((context) =>
        context.close()
      )
    );
    if (!page.isClosed()) await page.goto("about:blank");
    await fixture("cleanup");
  }
});

interface MealOperation {
  id: string;
  operationId: string;
  type: string;
  membershipId: string | null;
  supersededByOperationId: string | null;
}
function undoMeal(data: Setup, targetOperationId: string) {
  return {
    editionId: data.editionId,
    targetOperationId,
    id: uuidv7(),
    operationId: uuidv7(),
    auditEntryId: uuidv7(),
    now: Date.now(),
  };
}

test("Meal undo preserves history and requires a new capture before re-serving", async ({
  page,
  browser,
  baseURL,
  superAdminEmail,
  kalakritiActors,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "kalakriti_release_invariants",
    "Isolated LIVE undo fixture uses the serialized lane"
  );
  test.slow();
  const data = await fixture<Setup>("setup-scopes", superAdminEmail);
  const contexts = await Promise.all(
    [
      kalakritiActors.categoryLead,
      kalakritiActors.liaison,
      kalakritiActors.unrelatedVolunteer,
      kalakritiActors.editionAdmin,
    ].map((actor) =>
      browser.newContext({ baseURL, storageState: actor.storageState })
    )
  );
  try {
    const [lead, member, reader, editionAdmin] = await Promise.all(
      contexts.map((context) => context.newPage())
    );
    for (const actorPage of [page, lead!, member!, reader!, editionAdmin!])
      actorPage.setDefaultTimeout(10_000);
    const scanner = new KalakritiScanPage(lead!);
    await scanner.installDecoder();
    await gotoFood(lead!, data.year);
    await foodPerson(lead!, "Union Guardian");
    const breakfastIndex = await lead!
      .getByRole("columnheader", { name: "Breakfast" })
      .evaluate((node) => (node as HTMLTableCellElement).cellIndex);
    await scanner.open();
    const qr = JSON.stringify({ id: data.scopeGuardianId, type: "guardian" });
    await scanner.scan(qr);
    await expect
      .poll(async () => (await fixture<MealOperation[]>("state")).length)
      .toBe(1);
    const [original] = await fixture<MealOperation[]>("state");
    expect(original!.type).toBe("breakfast");
    for (const denied of [member!, reader!]) {
      await gotoFood(denied, data.year);
      await foodPerson(denied, "Union Guardian");
      await expect(
        denied.getByRole("button", {
          name: "Undo breakfast for Union Guardian",
          exact: true,
        })
      ).toHaveCount(0);
      expect(
        (
          await mutate(
            denied.request,
            "kalakritiOperation.undoMeal",
            undoMeal(data, original!.id)
          )
        ).error
      ).toBeDefined();
    }
    await gotoFood(page, data.year);
    await foodPerson(page, "Union Guardian");
    const undoButton = page.getByRole("button", {
      name: "Undo breakfast for Union Guardian",
      exact: true,
    });
    await undoButton.click();
    const confirmation = page.getByRole("alertdialog", {
      name: "Undo served meal?",
      exact: true,
    });
    await confirmation
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(confirmation).toBeHidden();
    expect(await fixture("state")).toEqual([original]);
    await undoButton.click();
    await confirmation
      .getByRole("button", { name: "Undo meal", exact: true })
      .click();
    await expect(confirmation).toBeHidden();
    await expect(foodCount(page, "Breakfast served")).toHaveText("0");
    const afterUndo = await fixture<MealOperation[]>("state");
    expect(afterUndo).toHaveLength(2);
    expect(
      afterUndo.find((row) => row.id === original!.id)?.supersededByOperationId
    ).toBe(afterUndo.find((row) => row.type === "meal_correction")?.id);
    const hiddenLeadBreakfast = lead!
      .getByRole("row", { includeHidden: true })
      .filter({ has: lead!.getByText("Union Guardian", { exact: true }) })
      .getByRole("cell", { includeHidden: true })
      .nth(breakfastIndex);
    await expect(
      hiddenLeadBreakfast.getByRole("img", {
        name: "Not served",
        exact: true,
        includeHidden: true,
      })
    ).toBeVisible();
    await scanner.scan(qr);
    expect(await fixture("state")).toEqual(afterUndo);
    for (const meal of ["Lunch", "Breakfast"]) {
      await scanner.dialog
        .getByRole("combobox", { name: "Meal", exact: true })
        .click();
      await lead!.getByRole("option", { name: meal, exact: true }).click();
    }
    await scanner.scan(qr);
    await expect
      .poll(async () => (await fixture<MealOperation[]>("state")).length)
      .toBe(3);
    await expect(foodCount(page, "Breakfast served")).toHaveText("1");
    const replacement = (await fixture<MealOperation[]>("state")).find(
      (row) => row.type === "breakfast" && row.supersededByOperationId === null
    )!;
    expect(replacement.id).not.toBe(original!.id);
    expect(replacement.operationId).not.toBe(original!.operationId);
    expect(
      (
        await mutate(
          page.request,
          "kalakritiOperation.undoMeal",
          undoMeal(data, original!.id)
        )
      ).error
    ).toBeDefined();
    await scanner.dialog
      .getByRole("button", { name: "Close", exact: true })
      .click();

    const leadUndo = undoMeal(data, replacement.id);
    expect(
      (await mutate(lead!.request, "kalakritiOperation.undoMeal", leadUndo))
        .error
    ).toBeUndefined();
    const freshServe = operation(
      data,
      "breakfast",
      data.scopeGuardianId,
      "guardian"
    );
    expect(
      (await mutate(lead!.request, "kalakritiOperation.record", freshServe))
        .error
    ).toBeUndefined();
    const beforeReplay = await fixture("state");
    expect(
      (await mutate(lead!.request, "kalakritiOperation.undoMeal", leadUndo))
        .error
    ).toBeUndefined();
    expect(
      (
        await mutate(
          lead!.request,
          "kalakritiOperation.undoMeal",
          undoMeal(data, replacement.id)
        )
      ).error
    ).toBeDefined();
    expect(await fixture("state")).toEqual(beforeReplay);

    const serveAudit = await fixture("audit", freshServe.id);
    expect(serveAudit).toEqual([
      {
        id: expect.any(String),
        action: "kalakritiOperation.record",
        outcome: "success",
      },
    ]);
    const editionUndo = undoMeal(data, freshServe.id);
    expect(
      (
        await mutate(
          editionAdmin!.request,
          "kalakritiOperation.undoMeal",
          editionUndo
        )
      ).error
    ).toBeUndefined();
    const beforeOriginalRetry = await fixture("state");
    expect(
      (await mutate(lead!.request, "kalakritiOperation.record", freshServe))
        .error
    ).toBeUndefined();
    expect(await fixture("state")).toEqual(beforeOriginalRetry);
    expect(await fixture("audit", freshServe.id)).toEqual(
      expect.arrayContaining(serveAudit as unknown[])
    );
    await expect(foodCount(page, "Breakfast served")).toHaveText("0");
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
    if (!page.isClosed()) await page.goto("about:blank");
    await fixture("cleanup");
  }
});

interface GuardianIdState {
  id: string;
  humanId: string | null;
  state: string;
  name: string;
}
async function backfillGuardianIds(editionId: string, apply: boolean) {
  const target = new URL(process.env.DATABASE_URL!);
  expect(
    `${target.host}${target.pathname}`,
    "Guardian backfill must target only the isolated test database"
  ).toBe("localhost:5433/pi-dash-test");
  await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(
        import.meta.dirname,
        "../../../../scripts/backfill-kalakriti-guardian-ids.ts"
      ),
      `--edition-id=${editionId}`,
      ...(apply
        ? ["--apply", `--confirm-target=${target.host}${target.pathname}`]
        : ["--dry-run"]),
    ],
    { env: process.env }
  );
}
async function openGuardianInvite(page: Page, year: number, email: string) {
  await page.goto(`/kalakriti/${year}/guardians`);
  await waitForZeroReady(page);
  await page
    .getByRole("button", { name: "Invite Guardian", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Invite Guardian",
    exact: true,
  });
  await dialog
    .getByRole("textbox", { name: /^Name\s*\*?$/ })
    .fill("Yearly Guardian");
  await dialog.getByRole("textbox", { name: /^Email\s*\*?$/ }).fill(email);
  return dialog;
}

test("Guardian yearly IDs backfill idempotently, remain stable on retry, and support legacy and yearly meal identifiers", async ({
  page,
  browser,
  baseURL,
  superAdminEmail,
  kalakritiActors,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "kalakriti_release_invariants",
    "Guardian IDs require isolated Edition fixtures"
  );
  test.slow();
  page.setDefaultTimeout(10_000);
  const data = await fixture<Setup>("setup-scopes", superAdminEmail);
  const foodContext = await browser.newContext({
    baseURL,
    storageState: kalakritiActors.categoryLead.storageState,
  });
  const readerContext = await browser.newContext({
    baseURL,
    storageState: kalakritiActors.unrelatedVolunteer.storageState,
  });
  try {
    const legacy = await fixture<GuardianIdState[]>("guardian-state");
    expect(legacy.every((row) => row.humanId === null)).toBe(true);
    await page.goto(`/kalakriti/${data.year}/guardians`);
    await waitForZeroReady(page);
    await expect(
      await cell(page, rowFor(page, "Union Guardian"), "Yearly ID")
    ).toHaveText("—");
    const initialCounter = await fixture("guardian-counter");
    await backfillGuardianIds(data.editionId, false);
    expect(await fixture("guardian-state")).toEqual(legacy);
    expect(await fixture("guardian-counter")).toEqual(initialCounter);
    await backfillGuardianIds(data.editionId, true);
    const assigned = await fixture<GuardianIdState[]>("guardian-state");
    expect(assigned.map((row) => row.id)).toEqual(legacy.map((row) => row.id));
    for (const row of assigned)
      expect(row.humanId).toMatch(/^KALG-2168-\d{4,}$/);
    expect(new Set(assigned.map((row) => row.humanId)).size).toBe(
      assigned.length
    );
    const assignedCounter = await fixture("guardian-counter");
    await backfillGuardianIds(data.editionId, true);
    expect(await fixture("guardian-state")).toEqual(assigned);
    expect(await fixture("guardian-counter")).toEqual(assignedCounter);
    const guardian = assigned.find((row) => row.id === data.scopeGuardianId)!;
    await expect(
      await cell(page, rowFor(page, "Union Guardian"), "Yearly ID")
    ).toHaveText(guardian.humanId!);
    await rowFor(page, "Union Guardian")
      .getByText("Union Guardian", { exact: true })
      .click();
    const details = page.getByRole("dialog", {
      name: "Union Guardian",
      exact: true,
    });
    await expect(details.getByText("Yearly ID", { exact: true })).toBeVisible();
    await expect(
      details.getByText(guardian.humanId!, { exact: true })
    ).toBeVisible();
    await details.getByRole("button", { name: "Close", exact: true }).click();
    await page.goto(
      filterUrl(
        `/kalakriti/${data.year}/guardians`,
        "humanId",
        guardian.humanId!,
        "contains"
      )
    );
    await expect(rowFor(page, "Union Guardian")).toBeVisible();

    const food = await foodContext.newPage();
    const scanner = new KalakritiScanPage(food);
    await scanner.installDecoder();
    await gotoFood(food, data.year);
    await foodPerson(food, "Union Guardian");
    await expect(
      await cell(food, rowFor(food, "Union Guardian"), "Person ID")
    ).toHaveText(guardian.humanId!);
    await scanner.open();
    const manual = scanner.dialog.getByLabel("Yearly ID");
    await manual.fill(guardian.humanId!);
    await scanner.dialog
      .getByRole("button", { name: "Record meal", exact: true })
      .click();
    await expect
      .poll(async () => (await fixture<MealOperation[]>("state")).length)
      .toBe(1);
    await scanner.scan(JSON.stringify({ id: guardian.id, type: "guardian" }));
    await manual.fill(guardian.id);
    await scanner.dialog
      .getByRole("button", { name: "Record meal", exact: true })
      .click();
    expect(await fixture<MealOperation[]>("state")).toHaveLength(1);
    await scanner.dialog
      .getByRole("combobox", { name: "Meal", exact: true })
      .click();
    await food.getByRole("option", { name: "Lunch", exact: true }).click();
    await scanner.scan(JSON.stringify({ id: guardian.id, type: "guardian" }));
    await expect
      .poll(async () => (await fixture<MealOperation[]>("state")).length)
      .toBe(2);
    const beforeDenied = await fixture("state");
    for (const type of [
      "pickup",
      "volunteer_check_in",
      "competition_attendance",
    ]) {
      expect(
        (
          await mutate(page.request, "kalakritiOperation.record", {
            ...operation(data, type, guardian.id, "guardian"),
            ...(type === "competition_attendance"
              ? { sessionId: data.sessionId }
              : {}),
          })
        ).error
      ).toBeDefined();
    }
    expect(
      (
        await mutate(readerContext.request, "kalakritiOperation.recordManual", {
          editionId: data.editionId,
          humanId: guardian.humanId,
          type: "breakfast",
          id: uuidv7(),
          operationId: uuidv7(),
          auditEntryId: uuidv7(),
          now: Date.now(),
          occurredAt: Date.now(),
        })
      ).error
    ).toBeDefined();
    expect(await fixture("state")).toEqual(beforeDenied);
    await scanner.close();

    let inviteRequest: import("@playwright/test").Request | undefined;
    const captureInvite = (request: import("@playwright/test").Request) => {
      if (
        request.method() === "POST" &&
        request.postData()?.includes(data.yearlyGuardianEmail)
      )
        inviteRequest = request;
    };
    page.on("request", captureInvite);
    const invite = await openGuardianInvite(
      page,
      data.year,
      data.yearlyGuardianEmail
    );
    await invite
      .getByLabel("Initial password", { exact: true })
      .fill("GuardianYearlyID!2168");
    await Promise.all([
      invite
        .getByRole("button", { name: "Invite Guardian", exact: true })
        .click(),
      backfillGuardianIds(data.editionId, true),
    ]);
    await expect(invite).toBeHidden();
    await expect(rowFor(page, "Yearly Guardian")).toBeVisible();
    page.off("request", captureInvite);
    const afterCreate = await fixture<GuardianIdState[]>("guardian-state");
    const created = afterCreate.find((row) => row.name === "Yearly Guardian")!;
    expect(created.humanId).toMatch(/^KALG-2168-\d{4,}$/);
    expect(assigned.some((row) => row.humanId === created.humanId)).toBe(false);
    const counterAfterCreate = await fixture("guardian-counter");
    expect(inviteRequest).toBeDefined();
    const retry = await page.request.post(inviteRequest!.url(), {
      data: inviteRequest!.postData()!,
      headers: inviteRequest!.headers(),
    });
    expect((await retry.text()).toLowerCase()).toContain("already");
    expect(await fixture("guardian-state")).toEqual(afterCreate);
    expect(await fixture("guardian-counter")).toEqual(counterAfterCreate);
    await page
      .getByRole("button", { name: "Actions for Yearly Guardian", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Archive access", exact: true })
      .click();
    await page
      .getByRole("alertdialog", {
        name: "Archive Guardian access?",
        exact: true,
      })
      .getByRole("button", { name: "Archive access", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await fixture<GuardianIdState[]>("guardian-state")).find(
            (row) => row.id === created.id
          )?.state
      )
      .toBe("archived");
    const reuse = await openGuardianInvite(
      page,
      data.year + 1,
      data.yearlyGuardianEmail
    );
    await reuse
      .getByRole("button", { name: "Invite Guardian", exact: true })
      .click();
    await page
      .getByRole("alertdialog", {
        name: "Reuse dormant Guardian account?",
        exact: true,
      })
      .getByRole("button", { name: "Reuse account", exact: true })
      .click();
    await expect(rowFor(page, "Yearly Guardian")).toBeVisible();
    const later = (
      await fixture<GuardianIdState[]>("guardian-state", data.foreignEditionId)
    ).find((row) => row.name === "Yearly Guardian")!;
    expect(later.id).not.toBe(created.id);
    expect(later.humanId).toMatch(/^KALG-2169-\d{4,}$/);
    expect(
      (await fixture<GuardianIdState[]>("guardian-state")).find(
        (row) => row.id === created.id
      )
    ).toEqual({ ...created, state: "archived" });
  } finally {
    await Promise.allSettled([foodContext.close(), readerContext.close()]);
    if (!page.isClosed()) await page.goto("about:blank");
    await fixture("cleanup");
  }
});

interface ScopedStudent {
  id: string;
  centerId: string;
  name: string;
  humanId: string;
}

test("Students directory unions assigned Centers while creation, quota and transport remain Center-scoped", async ({
  page,
  browser,
  baseURL,
  superAdminEmail,
  kalakritiActors,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "kalakriti_release_invariants",
    "Student union uses an isolated LIVE Edition"
  );
  test.slow();
  const data = await fixture<Setup>("setup-scopes", superAdminEmail);
  const guardianContext = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const liaisonContext = await browser.newContext({
    baseURL,
    storageState: kalakritiActors.unrelatedVolunteer.storageState,
  });
  try {
    const guardian = await guardianContext.newPage();
    const liaison = await liaisonContext.newPage();
    guardian.setDefaultTimeout(10_000);
    liaison.setDefaultTimeout(10_000);
    await guardian.goto("/login");
    await guardian.getByLabel("Email").fill(data.scopeGuardianEmail);
    await guardian.getByLabel("Password").fill(data.scopeGuardianPassword);
    await guardian.getByRole("button", { name: "Login", exact: true }).click();
    await guardian.waitForURL((url) => url.pathname !== "/login");
    for (const reader of [guardian, liaison]) {
      await reader.goto(`/kalakriti/${data.year}/students`);
      await waitForZeroReady(reader);
      await expect(
        reader.getByRole("heading", { name: "Students", exact: true })
      ).toBeVisible();
      await expect(
        reader.getByRole("combobox", { name: "Center", exact: true })
      ).toHaveCount(0);
      for (const [name, center] of [
        ["Activity Student", "Activity Center"],
        ["Another Center A Student", "Activity Center"],
        ["Union Student B", "Union Center B"],
      ]) {
        await expect(rowFor(reader, name!)).toBeVisible();
        await expect(
          await cell(reader, rowFor(reader, name!), "Center")
        ).toHaveText(center!);
      }
      await expect(
        await cell(
          reader,
          rowFor(reader, "Union Student B"),
          "Transport status"
        )
      ).toHaveText("Awaiting pickup");
      await expect(rowFor(reader, "Outside Student C")).toHaveCount(0);
      await rowFor(reader, "Union Student B")
        .getByText("Union Student B", { exact: true })
        .click();
      const details = reader.getByRole("dialog", {
        name: "Union Student B",
        exact: true,
      });
      await expect(
        details
          .getByRole("heading", { name: "Center details", exact: true })
          .locator("..")
          .getByText("Union Center B", { exact: true })
      ).toBeVisible();
      expect(
        JSON.parse(await new KalakritiPersonQrPage(reader).decodeQr(details))
      ).toEqual({ id: data.studentB, type: "student" });
      await details.getByRole("button", { name: "Close", exact: true }).click();
      await reader.goto(
        filterUrl(`/kalakriti/${data.year}/students`, "center", [data.centerB])
      );
      await expect(rowFor(reader, "Union Student B")).toBeVisible();
      await expect(rowFor(reader, "Activity Student")).toHaveCount(0);
      await reader.goto(
        filterUrl(
          `/kalakriti/${data.year}/students`,
          "center",
          [data.centerId, data.centerB],
          "is_any_of"
        )
      );
      await expect(rowFor(reader, "Activity Student")).toBeVisible();
      await expect(rowFor(reader, "Union Student B")).toBeVisible();
      await expect(rowFor(reader, "Outside Student C")).toHaveCount(0);
      await reader.goto(
        `/kalakriti/${data.year}/students?centerId=${data.centerB}`
      );
      await expect(rowFor(reader, "Union Student B")).toBeVisible();
      await expect(rowFor(reader, "Activity Student")).toHaveCount(0);
      await expect
        .poll(() => new URL(reader.url()).searchParams.has("centerId"))
        .toBe(false);
      await expect
        .poll(() => new URL(reader.url()).searchParams.has("filters"))
        .toBe(true);
      await reader.goto(
        `/kalakriti/${data.year}/students?centerId=${data.centerC}`
      );
      await expect(
        reader.getByText(/requested Center is unavailable/i)
      ).toBeVisible();
      await expect(rowFor(reader, "Outside Student C")).toHaveCount(0);
      await reader
        .getByRole("button", { name: /^Open Students directory$/i })
        .click();
      await expect(rowFor(reader, "Activity Student")).toBeVisible();
      await expect(rowFor(reader, "Union Student B")).toBeVisible();
    }
    expect(
      (
        await mutate(
          page.request,
          "kalakritiOperation.record",
          operation(data, "pickup", data.studentB)
        )
      ).error
    ).toBeUndefined();
    for (const reader of [guardian, liaison])
      await expect(
        await cell(
          reader,
          rowFor(reader, "Union Student B"),
          "Transport status"
        )
      ).toHaveText("Picked up");
    for (const [field, value, operator, count] of [
      ["humanId", "KAL-2168-0003", "contains", 1],
      ["name", "Union Student B", "contains", 1],
      ["transportStatus", "Picked up", "is", 1],
      ["dateOfBirth", Date.parse("2159-06-15T00:00:00Z"), "is", 3],
      ["gender", "female", "is", 3],
      ["gender", "male", "is", 0],
      ["ageCategory", data.ageCategoryId, "is", 3],
    ] as const) {
      await test.step(`Students filter ${field}`, async () => {
        await liaison.goto(
          filterUrl(`/kalakriti/${data.year}/students`, field, value, operator)
        );
        await waitForZeroReady(liaison);
        await expect(
          liaison.getByRole("row").filter({
            has: liaison.getByRole("cell").filter({ hasText: "KAL-2168-" }),
          })
        ).toHaveCount(count);
        await expect(rowFor(liaison, "Outside Student C")).toHaveCount(0);
      });
    }
    const staleFilters = {
      id: "root",
      type: "group",
      combinator: "and",
      rules: [
        {
          id: "keep-center",
          type: "rule",
          path: ["center"],
          operator: "is",
          value: [data.centerB],
        },
        {
          id: "nested",
          type: "group",
          combinator: "or",
          rules: [
            {
              id: "old-override",
              type: "rule",
              path: ["ageCategoryOverride"],
              operator: "is",
              value: "yes",
            },
            {
              id: "keep-name",
              type: "rule",
              path: ["name"],
              operator: "contains",
              value: "Union Student B",
            },
          ],
        },
        {
          id: "all-stale",
          type: "group",
          combinator: "and",
          rules: [
            {
              id: "old-center-status",
              type: "rule",
              path: ["centerStatus"],
              operator: "is",
              value: "retired",
            },
          ],
        },
      ],
    };
    await liaison.goto(
      `/kalakriti/${data.year}/students?filters=${encodeURIComponent(JSON.stringify(staleFilters))}`
    );
    await expect(rowFor(liaison, "Union Student B")).toBeVisible();
    await expect(rowFor(liaison, "Activity Student")).toHaveCount(0);
    await expect(rowFor(liaison, "Outside Student C")).toHaveCount(0);
    await expect
      .poll(() => {
        const query = JSON.parse(
          new URL(liaison.url()).searchParams.get("filters") ?? "{}"
        );
        const paths: string[] = [];
        const collect = (node: {
          type?: string;
          path?: string[];
          rules?: unknown[];
        }) => {
          if (node.type === "rule") paths.push((node.path ?? []).join("."));
          else
            for (const child of node.rules ?? []) collect(child as typeof node);
        };
        collect(query);
        return paths.sort();
      })
      .toEqual(["center", "name"]);
    expect(
      JSON.parse(new URL(liaison.url()).searchParams.get("filters")!)
    ).toMatchObject({
      id: "root",
      combinator: "and",
      rules: [
        { id: "keep-center", operator: "is", value: [data.centerB] },
        {
          id: "nested",
          combinator: "or",
          rules: [
            { id: "keep-name", operator: "contains", value: "Union Student B" },
          ],
        },
      ],
    });
    const { birthYear } = await fixture<{ birthYear: string }>(
      "open-student-registration"
    );
    const create = (centerId: string, name: string) => ({
      editionId: data.editionId,
      centerId,
      studentId: uuidv7(),
      auditEntryId: uuidv7(),
      now: Date.now(),
      name,
      dateOfBirth: `${birthYear}-06-15`,
      gender: "female",
      duplicateConfirmed: false,
      ageCategoryOverrideId: null,
      ageCategoryOverrideReason: null,
    });
    const beforeDenied = await fixture("student-state");
    for (const reader of [guardian, liaison])
      expect(
        (
          await mutate(
            reader.request,
            "kalakritiStudent.create",
            create(data.centerC, "Denied outside Student")
          )
        ).error
      ).toBeDefined();
    expect(await fixture("student-state")).toEqual(beforeDenied);
    const students = new KalakritiStudentsPage(guardian);
    for (const [center, centerId, name] of [
      ["Activity Center", data.centerId, "Union Created A"],
      ["Union Center B", data.centerB, "Union Created B"],
    ] as const) {
      await guardian.goto(`/kalakriti/${data.year}/students`);
      await waitForZeroReady(guardian);
      // This test exercises the initial wizard itself, before choosing a Center.
      await guardian
        .locator("#main")
        .getByRole("button", { name: "Register Student", exact: true })
        .click();
      const dialog = guardian.getByRole("dialog", {
        name: "Register Student",
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByText("Choose Center", { exact: true })
      ).toBeVisible();
      await dialog
        .getByRole("combobox", { name: /^Center(?:\s*\*)?$/ })
        .click();
      await expect(
        guardian.getByRole("option", { name: "Outside Center C", exact: true })
      ).toHaveCount(0);
      await guardian.getByRole("option", { name: center, exact: true }).click();
      await dialog
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await students.fillStudent(dialog, { name, birthYear });
      await dialog
        .getByRole("button", { name: "Register Student", exact: true })
        .click();
      await expect(dialog).toBeHidden();
      await expect(rowFor(guardian, name)).toBeVisible();
      await expect(
        await cell(guardian, rowFor(guardian, name), "Center")
      ).toHaveText(center);
      expect(
        (await fixture<ScopedStudent[]>("student-state")).find(
          (row) => row.name === name
        )?.centerId
      ).toBe(centerId);
      if (centerId === data.centerId) {
        const atQuota = await fixture("student-state");
        expect(
          (
            await mutate(
              guardian.request,
              "kalakritiStudent.create",
              create(data.centerId, "Over quota Student")
            )
          ).error
        ).toBeDefined();
        expect(await fixture("student-state")).toEqual(atQuota);
      }
    }
    const beforeClose = await fixture("student-state");
    await fixture("close");
    expect(
      (
        await mutate(
          guardian.request,
          "kalakritiStudent.create",
          create(data.centerB, "Closed registration Student")
        )
      ).error
    ).toBeDefined();
    expect(await fixture("student-state")).toEqual(beforeClose);
    await guardian.goto(`/kalakriti/${data.year}/students`);
    await waitForZeroReady(guardian);
    await expect(
      guardian
        .getByRole("button", { name: "Register Student", exact: true })
        .and(guardian.locator(":enabled"))
    ).toHaveCount(0);
    await expect(
      await cell(
        guardian,
        rowFor(guardian, "Union Student B"),
        "Transport status"
      )
    ).toHaveText("Picked up");
  } finally {
    await Promise.allSettled([guardianContext.close(), liaisonContext.close()]);
    if (!page.isClosed()) await page.goto("about:blank");
    await fixture("cleanup");
  }
});
