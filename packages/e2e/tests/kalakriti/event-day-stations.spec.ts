import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";
import { uuidv7 } from "uuidv7";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { KalakritiScanPage } from "../../pages/kalakriti-scan-page";

test.use({
  storageState: path.resolve(
    import.meta.dirname,
    "../../.auth/super_admin.json"
  ),
});
const execFileAsync = promisify(execFile);
interface Setup {
  year: number;
  editionId: string;
  studentId: string;
  studentHumanId: string;
  foreignStudentId: string;
  volunteerId: string;
  volunteerHumanId: string;
  secondVolunteerId: string;
  secondVolunteerHumanId: string;
  guardianId: string;
  sessionId: string;
  secondSessionId: string;
  wrongDivisionSessionId: string;
  cancelledSessionId: string;
  cancelledCompetitionSessionId: string;
  foreignSessionId: string;
}
interface Operation {
  operationId: string;
  studentId: string | null;
  membershipId: string | null;
  type: string;
  sessionId: string | null;
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
const state = () => fixture<Operation[]>("state");
const person = (id: string, type = "student") => JSON.stringify({ id, type });
function command(
  editionId: string,
  type: string,
  personQr: string,
  sessionId?: string
) {
  const now = Date.now();
  return {
    editionId,
    type,
    personQr,
    sessionId,
    id: uuidv7(),
    operationId: uuidv7(),
    auditEntryId: uuidv7(),
    now,
    occurredAt: now,
  };
}
async function mutate(
  request: APIRequestContext,
  args: Record<string, unknown>,
  name = "kalakritiOperation.record"
) {
  const id = uuidv7();
  const response = await request.post(
    "/api/zero/mutate?schema=zero_0&appID=zero",
    {
      data: {
        clientGroupID: `activity-${id}`,
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
  expect(body.mutations).toHaveLength(1);
  return body.mutations[0].result as { error?: string; message?: string };
}
async function openScanner(
  context: BrowserContext,
  year: number,
  beforeNavigate?: (page: Page) => Promise<void>
) {
  const scanner = new KalakritiScanPage(await context.newPage());
  await beforeNavigate?.(scanner.page);
  await scanner.installDecoder();
  await scanner.page.goto(`/kalakriti/${year}`);
  await waitForZeroReady(scanner.page);
  await scanner.open();
  return scanner;
}
async function manual(
  scanner: KalakritiScanPage,
  humanId: string,
  button: string
) {
  await scanner.dialog.getByLabel("Yearly ID").fill(humanId);
  await scanner.dialog
    .getByRole("button", { name: button, exact: true })
    .click();
}
async function chooseSession(scanner: KalakritiScanPage, name: string) {
  await scanner.dialog
    .getByRole("combobox", { name: "Competition session", exact: true })
    .click();
  await scanner.page.getByRole("option", { name: new RegExp(name) }).click();
}
const count = (expected: number) =>
  expect.poll(async () => (await state()).length).toBe(expected);

test("sidebar activities enforce role unions, prerequisites, scoped attendance and stale capture boundaries", async ({
  browser,
  baseURL,
  page,
  superAdminEmail,
  kalakritiActors,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "kalakriti_release_invariants",
    "Isolated LIVE activities run only in the serialized invariant lane"
  );
  test.slow();
  const data = await fixture<Setup>("setup", superAdminEmail);
  const foodContext = await browser.newContext({
    baseURL,
    storageState: kalakritiActors.categoryLead.storageState,
  });
  const hospitalityContext = await browser.newContext({
    baseURL,
    storageState: kalakritiActors.volunteerCoordinator.storageState,
  });
  const attendanceContext = await browser.newContext({
    baseURL,
    storageState: kalakritiActors.overallEventsLead.storageState,
  });
  const combinedContext = await browser.newContext({
    baseURL,
    storageState: kalakritiActors.liaison.storageState,
  });
  try {
    const food = await openScanner(foodContext, data.year);
    await expect(food.dialog.getByRole("tab")).toHaveCount(0);
    await expect(
      food.dialog.getByRole("button", { name: "Record meal", exact: true })
    ).toBeVisible();
    await expect(
      food.dialog.getByRole("button", { name: "Record check-in", exact: true })
    ).toHaveCount(0);
    const hospitality = await openScanner(hospitalityContext, data.year);
    await expect(hospitality.dialog.getByRole("tab")).toHaveCount(0);
    await expect(
      hospitality.dialog.getByRole("button", {
        name: "Record check-in",
        exact: true,
      })
    ).toBeVisible();
    const attendance = await openScanner(attendanceContext, data.year);
    await expect(attendance.dialog.getByRole("tab")).toHaveCount(0);
    await expect(attendance.dialog.getByLabel("Yearly ID")).toBeDisabled();
    await expect(
      attendance.dialog.getByRole("button", {
        name: "Record attendance",
        exact: true,
      })
    ).toBeDisabled();
    await attendance.dialog
      .getByRole("combobox", { name: "Competition session", exact: true })
      .click();
    await expect(
      attendance.page.getByRole("option", { name: /Station Singing/ })
    ).toBeVisible();
    await expect(
      attendance.page.getByRole("option", {
        name: /Station Dance|Unregistered Painting|Foreign Activity|Cancelled Drama/,
      })
    ).toHaveCount(0);
    await attendance.page.keyboard.press("Escape");
    const combined = await openScanner(combinedContext, data.year);
    await expect(combined.dialog.getByRole("tab")).toHaveCount(3);
    for (const name of [
      "Volunteer check-in",
      "Meals",
      "Competition attendance",
    ])
      await expect(
        combined.dialog.getByRole("tab", { name, exact: true })
      ).toBeVisible();
    await expect(
      combined.dialog.getByRole("tab", { name: "Transport", exact: true })
    ).toHaveCount(0);

    await expect(
      combined.dialog.getByRole("tab", {
        name: "Volunteer check-in",
        exact: true,
      })
    ).toHaveAttribute("aria-selected", "true");
    await combined.expectCameraActive(true);
    await combined.holdFrame();
    await fixture("remove-combined-hospitality");
    await expect(
      combined.dialog.getByText(
        "This scanning activity is no longer available. Close and reopen Scan."
      )
    ).toBeVisible();
    await combined.expectCameraActive(false);
    await expect(
      combined.dialog.getByRole("tab", { name: "Meals", exact: true })
    ).toHaveAttribute("aria-selected", "false");
    await combined.emitHeldFrame(person(data.secondVolunteerId, "volunteer"));
    expect(await state()).toHaveLength(0);

    const studentQr = person(data.studentId);
    const volunteerQr = person(data.volunteerId, "volunteer");
    for (const args of [
      command(data.editionId, "breakfast", studentQr),
      command(data.editionId, "breakfast", volunteerQr),
      command(
        data.editionId,
        "competition_attendance",
        studentQr,
        data.sessionId
      ),
    ])
      expect((await mutate(page.request, args)).error).toBeDefined();
    expect(await state()).toHaveLength(0);
    expect(
      (
        await mutate(
          food.page.request,
          command(data.editionId, "volunteer_check_in", volunteerQr)
        )
      ).error
    ).toBeDefined();
    expect(
      (
        await mutate(
          hospitality.page.request,
          command(data.editionId, "breakfast", volunteerQr)
        )
      ).error
    ).toBeDefined();
    expect(
      (await mutate(page.request, command(data.editionId, "pickup", studentQr)))
        .error
    ).toBeUndefined();
    await count(1);

    let holdOperations = false;
    const pendingOperations: (() => void)[] = [];
    const releaseOperations = () => {
      holdOperations = false;
      for (const send of pendingOperations.splice(0)) send();
    };
    const admin = await openScanner(
      page.context(),
      data.year,
      async (stationPage) => {
        await stationPage.routeWebSocket(/.*/, (client) => {
          const server = client.connectToServer();
          client.onMessage((message) => {
            if (
              holdOperations &&
              message.toString().includes("kalakritiOperation.record")
            )
              pendingOperations.push(() => server.send(message));
            else server.send(message);
          });
        });
      }
    );
    const expectPendingTabs = async () => {
      await expect.poll(() => pendingOperations.length).toBeGreaterThan(0);
      for (const name of [
        "Transport",
        "Volunteer check-in",
        "Meals",
        "Competition attendance",
      ])
        await expect(
          admin.dialog.getByRole("tab", { name, exact: true })
        ).toBeDisabled();
    };
    await expect(admin.dialog.getByRole("tab")).toHaveCount(4);
    await expect(
      admin.dialog.getByRole("tab", { name: "Transport", exact: true })
    ).toHaveAttribute("aria-selected", "true");
    await admin.dialog
      .getByRole("tab", { name: "Volunteer check-in", exact: true })
      .click();
    await admin.scan(volunteerQr, 8);
    await count(2);
    await admin.scan(volunteerQr, 8);
    expect(await state()).toHaveLength(2);
    expect(
      (
        await mutate(
          hospitality.page.request,
          command(data.editionId, "breakfast", volunteerQr)
        )
      ).error
    ).toBeDefined();
    const checkIn = (await state()).find(
      (row) => row.type === "volunteer_check_in"
    )!;
    await admin.holdFrame();
    await admin.dialog.getByRole("tab", { name: "Meals", exact: true }).click();
    await admin.emitHeldFrame(person(data.secondVolunteerId, "volunteer"));
    expect(await state()).toHaveLength(2);
    holdOperations = true;
    await manual(admin, data.studentHumanId, "Record meal");
    await expectPendingTabs();
    await expect(
      admin.dialog.getByRole("combobox", { name: "Meal", exact: true })
    ).toBeDisabled();
    releaseOperations();
    await count(3);
    expect(
      (
        await mutate(
          page.request,
          command(data.editionId, "breakfast", studentQr)
        )
      ).error
    ).toBeUndefined();
    expect(await state()).toHaveLength(3);
    await admin.expectCameraActive(true);
    await admin.holdFrame();
    await admin.dialog
      .getByRole("combobox", { name: "Meal", exact: true })
      .click();
    await admin.page
      .getByRole("option", { name: "Lunch", exact: true })
      .click();
    await admin.emitHeldFrame(volunteerQr);
    expect(await state()).toHaveLength(3);
    await admin.scan(volunteerQr, 8);
    await count(4);

    for (const sessionId of [
      undefined,
      data.wrongDivisionSessionId,
      data.cancelledSessionId,
      data.cancelledCompetitionSessionId,
      data.foreignSessionId,
    ])
      expect(
        (
          await mutate(
            page.request,
            command(
              data.editionId,
              "competition_attendance",
              studentQr,
              sessionId
            )
          )
        ).error
      ).toBeDefined();
    expect(
      (
        await mutate(
          attendance.page.request,
          command(
            data.editionId,
            "competition_attendance",
            studentQr,
            data.secondSessionId
          )
        )
      ).error
    ).toBeDefined();
    for (const qr of [
      person(data.foreignStudentId),
      person(data.guardianId, "guardian"),
      "legacy-credential-token",
    ])
      expect(
        (await mutate(page.request, command(data.editionId, "breakfast", qr)))
          .error
      ).toBeDefined();
    expect(await state()).toHaveLength(4);
    await admin.dialog
      .getByRole("tab", { name: "Competition attendance", exact: true })
      .click();
    await expect(
      admin.dialog.getByRole("button", {
        name: "Record attendance",
        exact: true,
      })
    ).toBeDisabled();
    await chooseSession(admin, "Station Singing");
    holdOperations = true;
    await admin.scan(studentQr, 8);
    await expectPendingTabs();
    await expect(
      admin.dialog.getByRole("combobox", {
        name: "Competition session",
        exact: true,
      })
    ).toBeDisabled();
    releaseOperations();
    await count(5);
    await admin.holdFrame();
    await chooseSession(admin, "Station Dance");
    await admin.emitHeldFrame(studentQr);
    expect(await state()).toHaveLength(5);
    await admin.scan(studentQr, 8);
    await count(6);
    expect(
      (await state())
        .filter((row) => row.type === "competition_attendance")
        .map((row) => row.sessionId)
        .sort()
    ).toEqual([data.sessionId, data.secondSessionId].sort());
    expect(
      (
        await mutate(
          attendance.page.request,
          command(
            data.editionId,
            "competition_attendance",
            studentQr,
            data.sessionId
          )
        )
      ).error
    ).toBeUndefined();
    expect(await state()).toHaveLength(6);
    await manual(food, data.volunteerHumanId, "Record meal");
    await count(7);
    await manual(hospitality, data.secondVolunteerHumanId, "Record check-in");
    await count(8);
    const recorded = await state();
    await admin.holdFrame();
    await fixture("close");
    await expect(
      admin.dialog.getByRole("button", {
        name: "Record attendance",
        exact: true,
      })
    ).toBeDisabled();
    await admin.expectCameraActive(false);
    await admin.emitHeldFrame(studentQr);
    expect(
      (await mutate(page.request, command(data.editionId, "lunch", studentQr)))
        .error
    ).toBeDefined();
    expect(
      (
        await mutate(page.request, {
          ...command(data.editionId, "volunteer_check_in", volunteerQr),
          operationId: checkIn.operationId,
        })
      ).error
    ).toBeUndefined();
    expect(await state()).toEqual(recorded);
    await fixture("archive");
    await admin.expectCameraActive(false);
    await admin.page.reload();
    await expect(
      admin.page.getByRole("button", { name: "Scan", exact: true })
    ).toHaveCount(0);
    expect(
      (
        await mutate(
          page.request,
          command(
            data.editionId,
            "breakfast",
            person(data.secondVolunteerId, "volunteer")
          )
        )
      ).error
    ).toBeDefined();
    expect(await state()).toEqual(recorded);
  } finally {
    await Promise.allSettled(
      [foodContext, hospitalityContext, attendanceContext, combinedContext].map(
        (context) => context.close()
      )
    );
    for (const ownedPage of page.context().pages())
      if (!ownedPage.isClosed()) await ownedPage.goto("about:blank");
    await fixture("cleanup");
  }
});
