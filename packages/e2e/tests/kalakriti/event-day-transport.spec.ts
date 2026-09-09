import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { APIRequestContext, Page } from "@playwright/test";
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
  centerId: string;
  otherCenterId: string;
  emptyCenterId: string;
  absentStudentId: string;
  absentHumanId: string;
  secondStudentId: string;
  secondHumanId: string;
  vehicleId: string;
  editionId: string;
  year: number;
  studentId: string;
  otherStudentId: string;
  humanId: string;
  otherHumanId: string;
  leadMembershipId: string;
  guardianMembershipId: string;
  guardianEmail: string;
  guardianPassword: string;
}
interface SessionState {
  operations: Operation[];
  stages: { centerId: string; stage: string; finalizedAt: string | null }[];
  vehicles: { id: string; status: string }[];
  history: { assignmentId: string; toStatus: string }[];
}
interface Operation {
  studentId: string;
  type: string;
  operationId: string;
}
async function fixture<T>(action: string, ...args: string[]): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(
        import.meta.dirname,
        "../../helpers/kalakriti-event-day-transport.ts"
      ),
      action,
      ...args,
    ],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}
function command(
  editionId: string,
  centerId: string,
  expectedStage = "pickup"
) {
  const now = Date.now();
  return {
    editionId,
    centerId,
    expectedStage,
    id: uuidv7(),
    operationId: uuidv7(),
    auditEntryId: uuidv7(),
    now,
    occurredAt: now,
  };
}
async function state() {
  return await fixture<SessionState>("session-state");
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
        clientGroupID: `station-${id}`,
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

async function expectTransportStatus(page: Page, name: string, status: string) {
  const row = page
    .getByRole("row")
    .filter({ has: page.getByText(name, { exact: true }) });
  await expect(
    row.getByRole("cell", { name: status, exact: true })
  ).toBeVisible();
}

test("Center scan sessions mark two Students through four explicitly finalized stages without stale-frame advancement", async ({
  baseURL,
  browser,
  page,
  superAdminEmail,
  volunteerEmail,
  kalakritiActors,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "kalakriti_release_invariants",
    "Serialized live Edition invariant lane"
  );
  test.slow();
  const data = await fixture<Setup>(
    "setup",
    superAdminEmail,
    kalakritiActors.liaison.email,
    volunteerEmail
  );
  const leadContext = await browser.newContext({
    baseURL,
    storageState: path.resolve(
      import.meta.dirname,
      "../../.auth/volunteer.json"
    ),
  });
  const liaisonContext = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    storageState: kalakritiActors.liaison.storageState,
  });
  const foodContext = await browser.newContext({
    baseURL,
    storageState: kalakritiActors.categoryLead.storageState,
  });
  const guardianContext = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  try {
    await page.goto(`/kalakriti/${data.year}/centers`);
    await waitForZeroReady(page);
    await expect(
      page.getByRole("columnheader", { name: "Transport status", exact: false })
    ).toBeVisible();
    const students = await page.context().newPage();
    await students.goto(`/kalakriti/${data.year}/students`);
    await waitForZeroReady(students);
    await students
      .getByRole("combobox", { name: "Center", exact: true })
      .click();
    await students
      .getByRole("option", { name: "Station Center A", exact: true })
      .click();
    await expect(
      students.getByRole("columnheader", {
        name: "Transport status",
        exact: false,
      })
    ).toBeVisible();
    await expectTransportStatus(page, "Station Center A", "Awaiting pickup");
    await expectTransportStatus(
      students,
      "Station Student A",
      "Awaiting pickup"
    );
    await expectTransportStatus(
      students,
      "Absent Station Student",
      "Awaiting pickup"
    );
    const liaison = new KalakritiScanPage(await liaisonContext.newPage());
    await liaison.installDecoder();
    await liaison.goto(data.year, "students");
    await liaison.openFromMobileSidebar();
    const assertIncomplete = async (stage: string) => {
      await expect(
        liaison.dialog.getByRole("button", {
          name: "Finish stage",
          exact: true,
        })
      ).toBeDisabled();
      const before = await state();
      expect(
        (
          await mutate(
            liaison.page.request,
            "kalakritiCenterScan.finalize",
            command(data.editionId, data.centerId, stage)
          )
        ).error
      ).toBeDefined();
      expect(
        (
          await mutate(
            liaison.page.request,
            "kalakritiCenterScan.recordManual",
            {
              ...command(data.editionId, data.centerId, stage),
              humanId: data.absentHumanId,
            }
          )
        ).error
      ).toBeDefined();
      expect(await state()).toEqual(before);
      await expect(
        liaison.dialog.getByText(
          `Absent Station Student · ${data.absentHumanId}`,
          { exact: true }
        )
      ).toHaveCount(0);
    };

    await expect(
      liaison.dialog.getByRole("heading", {
        name: "Current stage: Pickup",
        exact: true,
      })
    ).toBeVisible();
    await liaison.expectStarts(1);
    await expect(
      liaison.dialog.getByRole("combobox", { name: "Center", exact: true })
    ).toHaveCount(0);
    await expect(
      liaison.dialog.getByText("Station Center A", { exact: true })
    ).toBeVisible();
    const studentQr = JSON.stringify({ id: data.studentId, type: "student" });
    const secondQr = JSON.stringify({
      id: data.secondStudentId,
      type: "student",
    });
    await expect(
      liaison.dialog.getByText("0 of 3 Students marked", { exact: true })
    ).toBeVisible();
    await expect(
      liaison.dialog.getByRole("button", { name: "Finish stage", exact: true })
    ).toBeDisabled();
    expect(
      (
        await mutate(
          liaison.page.request,
          "kalakritiCenterScan.finalize",
          command(data.editionId, data.centerId)
        )
      ).error
    ).toBeDefined();
    await liaison.scan(studentQr, 8);
    await expectTransportStatus(students, "Station Student A", "Picked up");
    await expectTransportStatus(
      students,
      "Second Station Student A",
      "Awaiting pickup"
    );
    await expectTransportStatus(page, "Station Center A", "Awaiting pickup");
    await expect(
      liaison.dialog.getByText("1 of 3 Students marked", { exact: true })
    ).toBeVisible();
    await liaison.scan(studentQr, 8);
    await expect(
      liaison.dialog.getByRole("button", { name: "Finish stage", exact: true })
    ).toBeEnabled();

    await expect(
      liaison.dialog.getByText(
        `Second Station Student A · ${data.secondHumanId}`,
        { exact: true }
      )
    ).toBeVisible();
    await liaison.manual(data.secondHumanId);
    await expect(
      liaison.dialog.getByText("2 of 3 Students marked", { exact: true })
    ).toBeVisible();
    await liaison.scan(secondQr, 8);
    await liaison.expectStarts(1);
    await expectTransportStatus(
      students,
      "Second Station Student A",
      "Picked up"
    );
    await expectTransportStatus(page, "Station Center A", "Awaiting pickup");
    const markedPickup = await state();
    expect(markedPickup.operations).toHaveLength(2);
    expect(
      markedPickup.stages.filter((stage) => stage.finalizedAt)
    ).toHaveLength(0);
    expect(
      markedPickup.vehicles.find((vehicle) => vehicle.id === data.vehicleId)
        ?.status
    ).toBe("planned");
    await expect(
      liaison.dialog.getByText(
        `Absent Station Student · ${data.absentHumanId}`,
        { exact: true }
      )
    ).toBeVisible();
    await liaison.holdFrame();
    await liaison.finish("Pickup");
    await liaison.emitHeldFrame(secondQr);
    await expect
      .poll(
        async () =>
          (await state()).vehicles.find(
            (vehicle) => vehicle.id === data.vehicleId
          )?.status
      )
      .toBe("departed_center");
    await expectTransportStatus(page, "Station Center A", "Heading to event");
    expect((await state()).operations).toHaveLength(2);
    const original = markedPickup.operations.find(
      (row) => row.studentId === data.studentId
    )!;
    expect(
      (
        await mutate(liaison.page.request, "kalakritiCenterScan.record", {
          ...command(data.editionId, data.centerId),
          personQr: studentQr,
        })
      ).error
    ).toBeDefined();
    expect(
      (
        await mutate(liaison.page.request, "kalakritiCenterScan.record", {
          ...command(data.editionId, data.centerId),
          operationId: original.operationId,
          personQr: studentQr,
        })
      ).error
    ).toBeUndefined();
    expect((await state()).operations).toHaveLength(2);

    await liaison.open();
    await expect(
      liaison.dialog.getByRole("heading", {
        name: "Current stage: Venue arrival",
        exact: true,
      })
    ).toBeVisible();
    await expect(
      liaison.dialog.getByText("0 of 2 Students marked", { exact: true })
    ).toBeVisible();
    await liaison.scan(studentQr, 5);
    await expectTransportStatus(students, "Station Student A", "At Event");
    await expectTransportStatus(
      students,
      "Second Station Student A",
      "Picked up"
    );
    await expectTransportStatus(page, "Station Center A", "Heading to event");
    await expect(
      liaison.dialog.getByText("1 of 2 Students marked", { exact: true })
    ).toBeVisible();
    await assertIncomplete("venue_arrival");
    await liaison.close();
    await liaison.open();
    await expect(
      liaison.dialog.getByText("1 of 2 Students marked", { exact: true })
    ).toBeVisible();
    await liaison.scan(secondQr, 5);
    await expectTransportStatus(
      students,
      "Second Station Student A",
      "At Event"
    );
    await expectTransportStatus(page, "Station Center A", "Heading to event");
    await liaison.expectStarts(3);
    await expect(
      liaison.dialog.getByText("2 of 2 Students marked", { exact: true })
    ).toBeVisible();
    await liaison.holdFrame();
    expect(
      (
        await mutate(
          page.request,
          "kalakritiCenterScan.finalize",
          command(data.editionId, data.centerId, "venue_arrival")
        )
      ).error
    ).toBeUndefined();
    await expect(
      liaison.dialog.getByText(
        "Someone has already finished this step. Close this window and open Scan again when you're ready for the next part of the trip."
      )
    ).toBeVisible();
    await expect(
      liaison.dialog.getByRole("button", { name: "Mark Student", exact: true })
    ).toBeDisabled();
    await liaison.emitHeldFrame(secondQr);
    expect((await state()).operations).toHaveLength(4);
    expect(
      (await state()).vehicles.find((vehicle) => vehicle.id === data.vehicleId)
        ?.status
    ).toBe("arrived_at_venue");
    await expectTransportStatus(page, "Station Center A", "At Event");
    await liaison.close();
    for (const [label, status, count] of [
      ["Venue departure", "departed_venue", 6],
      ["Drop-off", "completed", 8],
    ] as const) {
      await liaison.open();
      await expect(
        liaison.dialog.getByRole("heading", {
          name: `Current stage: ${label}`,
          exact: true,
        })
      ).toBeVisible();
      await expect(
        liaison.dialog.getByText("0 of 2 Students marked", { exact: true })
      ).toBeVisible();
      await liaison.scan(studentQr, 8);
      const studentStatus =
        label === "Venue departure" ? "Returning" : "Back at Center";
      const previousStatus =
        label === "Venue departure" ? "At Event" : "Returning";
      await expectTransportStatus(students, "Station Student A", studentStatus);
      await expectTransportStatus(
        students,
        "Second Station Student A",
        previousStatus
      );
      await expectTransportStatus(page, "Station Center A", previousStatus);
      await expect(
        liaison.dialog.getByText("1 of 2 Students marked", { exact: true })
      ).toBeVisible();
      await assertIncomplete(
        label === "Venue departure" ? "venue_departure" : "drop_off"
      );
      await liaison.manual(data.secondHumanId);
      await expect(
        liaison.dialog.getByText("2 of 2 Students marked", { exact: true })
      ).toBeVisible();
      await expectTransportStatus(
        students,
        "Second Station Student A",
        studentStatus
      );
      await expectTransportStatus(page, "Station Center A", previousStatus);
      await liaison.holdFrame();
      await liaison.finish(label);
      await expectTransportStatus(page, "Station Center A", studentStatus);
      await liaison.emitHeldFrame(secondQr);
      await expect
        .poll(
          async () =>
            (await state()).vehicles.find(
              (vehicle) => vehicle.id === data.vehicleId
            )?.status
        )
        .toBe(status);
      expect((await state()).operations).toHaveLength(count);
    }
    await expectTransportStatus(
      students,
      "Absent Station Student",
      "Awaiting pickup"
    );
    const completed = await state();
    expect(
      completed.operations.filter(
        (row) => row.studentId === data.absentStudentId
      )
    ).toHaveLength(0);
    expect(
      completed.stages
        .filter((row) => row.centerId === data.centerId && row.finalizedAt)
        .map((row) => row.stage)
        .sort()
    ).toEqual(["drop_off", "pickup", "venue_arrival", "venue_departure"]);
    expect(
      completed.history
        .filter((row) => row.assignmentId === data.vehicleId)
        .map((row) => row.toStatus)
    ).toEqual([
      "planned",
      "departed_center",
      "arrived_at_venue",
      "departed_venue",
      "completed",
    ]);
    expect(
      new Set(completed.operations.map((row) => row.operationId)).size
    ).toBe(8);
    await liaison.open();
    await expect(
      liaison.dialog.getByRole("heading", {
        name: "Current stage: All stages finished",
        exact: true,
      })
    ).toBeVisible();
    await expect(
      liaison.dialog.getByRole("button", { name: "Mark Student", exact: true })
    ).toBeDisabled();
    await liaison.close();

    const lead = new KalakritiScanPage(await leadContext.newPage());
    await lead.installDecoder();
    await lead.goto(data.year);
    await lead.failCamera();
    await lead.open("Station Center B");
    await expect(lead.dialog.getByRole("alert")).toContainText(
      "Camera couldn't start"
    );
    await lead.manual(data.otherHumanId);
    await expect(
      lead.dialog.getByText("1 of 1 Students marked", { exact: true })
    ).toBeVisible();
    expect(
      (
        await mutate(
          lead.page.request,
          "kalakritiCenterScan.finalize",
          command(data.editionId, data.emptyCenterId)
        )
      ).error
    ).toBeDefined();
    const guardian = await guardianContext.newPage();
    await guardian.goto("/login");
    await guardian.getByLabel("Email").fill(data.guardianEmail);
    await guardian.getByLabel("Password").fill(data.guardianPassword);
    await guardian.getByRole("button", { name: "Login", exact: true }).click();
    await guardian.waitForURL((url) => !url.pathname.startsWith("/login"));
    const food = await foodContext.newPage();
    for (const deniedPage of [guardian, food]) {
      await deniedPage.goto(`/kalakriti/${data.year}`);
      await waitForZeroReady(deniedPage);
      await expect(
        deniedPage.getByRole("button", { name: "Scan", exact: true })
      ).toHaveCount(0);
      await deniedPage.goto(`/kalakriti/${data.year}/event-day`);
      await expect(
        deniedPage.getByRole("heading", { name: "Page not found" })
      ).toBeVisible();
      await expect(
        deniedPage.getByRole("button", { name: "Scan", exact: true })
      ).toHaveCount(0);
    }
    const beforeDenied = await state();
    for (const request of [
      guardian.request,
      food.request,
      liaison.page.request,
    ]) {
      for (const [name, subject] of [
        [
          "record",
          {
            personQr: JSON.stringify({
              id: data.otherStudentId,
              type: "student",
            }),
          },
        ],
        ["recordManual", { humanId: data.otherHumanId }],
        ["finalize", {}],
      ] as const) {
        expect(
          (
            await mutate(request, `kalakritiCenterScan.${name}`, {
              ...command(data.editionId, data.otherCenterId),
              ...subject,
            })
          ).error
        ).toBeDefined();
      }
    }
    expect(await state()).toEqual(beforeDenied);
    await lead.finish("Pickup");
    await lead.failCamera(false);
    await lead.open("Station Center B");
    await expect(
      lead.dialog.getByText("0 of 1 Students marked", { exact: true })
    ).toBeVisible();
    await lead.expectCameraActive(true);
    await lead.holdFrame();
    const pendingQr = JSON.stringify({
      id: data.otherStudentId,
      type: "student",
    });
    const beforeInvalidation = await state();
    // Invalidate an open session with an unmarked Student, without navigation or reload.
    await fixture("close");
    await expect(
      lead.dialog.getByRole("button", { name: "Mark Student", exact: true })
    ).toBeDisabled();
    await lead.expectCameraActive(false);
    await lead.emitHeldFrame(pendingQr);
    expect(await state()).toEqual(beforeInvalidation);
    const closed = await mutate(
      lead.page.request,
      "kalakritiCenterScan.finalize",
      command(data.editionId, data.otherCenterId)
    );
    expect(closed.error).toBeDefined();
    expect(closed.message).toContain("live");
    expect(
      (
        await mutate(liaison.page.request, "kalakritiCenterScan.record", {
          ...command(data.editionId, data.centerId),
          operationId: original.operationId,
          personQr: studentQr,
        })
      ).error
    ).toBeUndefined();
    await expect(
      lead.dialog.getByRole("button", { name: "Mark Student", exact: true })
    ).toBeDisabled();
    await expect(
      lead.dialog.getByText("Scanning will be available when the event starts.")
    ).toBeVisible();
    // Restore only fixture lifecycle so archival independently invalidates an active camera.
    await fixture("live");
    await lead.expectCameraActive(true);
    await lead.holdFrame();
    await fixture("archive");
    await lead.expectCameraActive(false);
    await expect(
      lead.dialog.getByRole("button", { name: "Mark Student", exact: true })
    ).toHaveCount(0);
    await lead.emitHeldFrame(pendingQr);
    expect(await state()).toEqual(beforeInvalidation);
    await lead.page.reload();
    await expect(
      lead.page.getByRole("button", { name: "Scan", exact: true })
    ).toHaveCount(0);
    expect(
      (
        await mutate(
          lead.page.request,
          "kalakritiCenterScan.finalize",
          command(data.editionId, data.otherCenterId)
        )
      ).error
    ).toBeDefined();
    expect(await state()).toEqual(beforeInvalidation);
  } finally {
    await Promise.allSettled(
      [leadContext, liaisonContext, foodContext, guardianContext].map(
        (context) => context.close()
      )
    );
    if (!page.isClosed()) await page.goto("about:blank");
    await fixture("cleanup");
  }
});
