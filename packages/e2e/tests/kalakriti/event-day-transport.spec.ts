import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { APIRequestContext } from "@playwright/test";
import { uuidv7 } from "uuidv7";

import { expect, test } from "../../fixtures/test";
import { KalakritiEventDayPage } from "../../pages/kalakriti-event-day-page";

test.use({
  storageState: path.resolve(
    import.meta.dirname,
    "../../.auth/super_admin.json"
  ),
});
const execFileAsync = promisify(execFile);
interface Setup {
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
function command(editionId: string, type = "pickup") {
  const now = Date.now();
  return {
    editionId,
    type,
    id: uuidv7(),
    operationId: uuidv7(),
    auditEntryId: uuidv7(),
    now,
    occurredAt: now,
  };
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

test("event-day station records isolated live checkpoints, scopes actors, and preserves replay across the live gate", async ({
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
    const liaison = new KalakritiEventDayPage(await liaisonContext.newPage());
    await liaison.installDecoder();
    await liaison.goto(data.year);
    await liaison.manual(data.humanId);
    await expect
      .poll(async () => (await fixture<Operation[]>("state")).length)
      .toBe(1);
    await liaison.manual(data.humanId);
    expect(await fixture<Operation[]>("state")).toHaveLength(1);
    for (const checkpoint of ["Venue departure", "Drop-off"] as const) {
      await liaison.checkpoint(checkpoint);
      await liaison.scan(
        JSON.stringify({ id: data.studentId, type: "student" }),
        5
      );
    }
    await expect
      .poll(async () => (await fixture<Operation[]>("state")).length)
      .toBe(3);
    for (const type of ["pickup", "venue_departure", "drop_off"]) {
      const denied = await mutate(
        liaison.page.request,
        "kalakritiOperation.recordManual",
        { ...command(data.editionId, type), humanId: data.otherHumanId }
      );
      expect(denied.error).toBeDefined();
    }

    const lead = new KalakritiEventDayPage(await leadContext.newPage());
    await lead.installDecoder();
    await lead.goto(data.year);
    const studentQr = JSON.stringify({
      id: data.otherStudentId,
      type: "student",
    });
    await lead.scan(studentQr, 8);
    await expect
      .poll(async () => (await fixture<Operation[]>("state")).length)
      .toBe(4);
    await lead.scan(studentQr, 8);
    expect(await fixture<Operation[]>("state")).toHaveLength(4);
    await lead.checkpoint("Venue departure");
    await lead.scan(studentQr, 8);
    await expect
      .poll(async () => (await fixture<Operation[]>("state")).length)
      .toBe(5);
    await lead.checkpoint("Pickup");
    await lead.scan(studentQr);
    expect(await fixture<Operation[]>("state")).toHaveLength(5);
    await lead.checkpoint("Drop-off");
    await lead.scan(studentQr, 8);
    await expect
      .poll(async () => (await fixture<Operation[]>("state")).length)
      .toBe(6);
    await lead.scan(
      JSON.stringify({ id: data.leadMembershipId, type: "volunteer" })
    );
    await expect(
      lead.page.getByText("Scan a Student QR code", { exact: true })
    ).toBeVisible();
    await lead.scan("legacy-opaque-credential");
    await expect(
      lead.page.getByText("Scan a valid Student QR code", { exact: true })
    ).toBeVisible();
    const recorded = await fixture<Operation[]>("state");
    expect(recorded).toHaveLength(6);
    expect(new Set(recorded.map((row) => row.operationId)).size).toBe(6);
    for (const studentId of [data.studentId, data.otherStudentId])
      expect(
        recorded
          .filter((row) => row.studentId === studentId)
          .map((row) => row.type)
          .sort()
      ).toEqual(["drop_off", "pickup", "venue_departure"]);

    const guardian = await guardianContext.newPage();
    await guardian.goto("/login");
    await guardian.getByLabel("Email").fill(data.guardianEmail);
    await guardian.getByLabel("Password").fill(data.guardianPassword);
    await guardian.getByRole("button", { name: "Login", exact: true }).click();
    await guardian.waitForURL((url) => !url.pathname.startsWith("/login"));
    for (const deniedPage of [guardian, await foodContext.newPage()]) {
      await deniedPage.goto(`/kalakriti/${data.year}/event-day`);
      await expect(
        deniedPage.getByRole("heading", { name: "Page not found" })
      ).toBeVisible();
      await expect(
        deniedPage.getByRole("link", { name: "Event day", exact: true })
      ).toHaveCount(0);
      for (const type of ["pickup", "venue_departure", "drop_off"])
        expect(
          (
            await mutate(
              deniedPage.request,
              "kalakritiOperation.recordManual",
              { ...command(data.editionId, type), humanId: data.humanId }
            )
          ).error
        ).toBeDefined();
    }
    expect(await fixture<Operation[]>("state")).toEqual(recorded);
    await fixture("close");
    const fresh = await mutate(
      page.request,
      "kalakritiOperation.recordManual",
      { ...command(data.editionId), humanId: data.humanId }
    );
    expect(fresh.error).toBeDefined();
    const original = recorded.find(
      (row) => row.studentId === data.otherStudentId && row.type === "pickup"
    )!;
    const replay = await mutate(
      lead.page.request,
      "kalakritiOperation.record",
      {
        ...command(data.editionId),
        operationId: original.operationId,
        personQr: studentQr,
      }
    );
    expect(replay.error).toBeUndefined();
    expect(await fixture<Operation[]>("state")).toEqual(recorded);
    await lead.goto(data.year);
    await expect(
      lead.page.getByRole("button", { name: "Record transport", exact: true })
    ).toBeDisabled();
    await expect(
      lead.page.getByText(
        "Transport recording is available only while this Edition is live."
      )
    ).toBeVisible();
    await fixture("archive");
    await lead.page.reload();
    await expect(
      lead.page.getByRole("heading", { name: "Page not found" })
    ).toBeVisible();
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
