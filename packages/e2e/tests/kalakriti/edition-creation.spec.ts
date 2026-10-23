import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { KalakritiEditionPage } from "../../pages/kalakriti-edition-page";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-edition-creation.ts"
);
const YEAR = 2094;
const DELETE_YEAR = 2096;

type FixtureAction =
  | "cleanup"
  | "event-exists"
  | "rollback-cleanup"
  | "rollback-setup"
  | "rollback-state"
  | "state";

async function fixture<T>(action: FixtureAction, value?: string) {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...(value ? [value] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

function buildMutateBody(args: Record<string, unknown>) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    clientGroupID: `e2e-kalakriti-rollback-cg-${suffix}`,
    mutations: [
      {
        args: [args],
        clientID: `e2e-kalakriti-rollback-${suffix}`,
        id: 1,
        name: "kalakritiEdition.create",
        timestamp: Date.now(),
        type: "custom" as const,
      },
    ],
    pushVersion: 1,
    requestID: `e2e-kalakriti-rollback-req-${suffix}`,
    timestamp: Date.now(),
  };
}

async function mutateEditionCreate(
  page: import("@playwright/test").Page,
  baseURL: string | undefined,
  args: Record<string, unknown>
) {
  const response = await page.request.post(
    `${baseURL}/api/zero/mutate?schema=zero_0&appID=zero`,
    { data: buildMutateBody(args) }
  );
  expect(response.ok()).toBe(true);
  return response.json();
}

test("creates and updates an Edition with its protected linked event", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Super-admin Edition creation flow"
  );
  test.slow();
  await fixture("cleanup");
  const editionPage = new KalakritiEditionPage(page);

  try {
    await editionPage.create({ name: `Kalakriti ${YEAR}`, year: YEAR });
    await waitForZeroReady(page);
    await editionPage.editMinimumCompetitions(3);
    await editionPage.editDetails({
      name: `Kalakriti ${YEAR} Revised`,
      year: YEAR,
    });
    const state = await fixture<{
      ageCutoffDate: string;
      brandingKey: string;
      editionId: string;
      eventDate: string;
      eventName: string;
      eventStartTime: string;
      managementDomain: string;
      minTotalCompetitions: number;
      name: string;
      plannedRegistrationCloseAt: string;
      teamEventId: string;
      year: number;
    }>("state");
    expect(state).toMatchObject({
      ageCutoffDate: `${YEAR}-06-30`,
      brandingKey: `kalakriti-${YEAR}-updated`,
      eventDate: `${YEAR}-11-21`,
      eventName: `Kalakriti ${YEAR} Revised`,
      eventStartTime: `${YEAR}-11-20T18:30:00.000Z`,
      managementDomain: "kalakriti",
      minTotalCompetitions: 3,
      name: `Kalakriti ${YEAR} Revised`,
      plannedRegistrationCloseAt: `${YEAR}-10-31T12:30:00.000Z`,
      year: YEAR,
    });
    expect(state.editionId).not.toBe(state.teamEventId);
  } finally {
    await page.goto("about:blank");
    await fixture("cleanup");
  }
});

test("deletes a draft Edition with its linked event from settings", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Super-admin Edition deletion flow"
  );
  test.slow();
  await fixture("cleanup", String(DELETE_YEAR));
  const editionPage = new KalakritiEditionPage(page);

  try {
    await editionPage.create({
      name: `Kalakriti ${DELETE_YEAR}`,
      year: DELETE_YEAR,
    });
    await waitForZeroReady(page);
    const created = await fixture<{ teamEventId: string }>(
      "state",
      String(DELETE_YEAR)
    );
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/edition$/);
    await page
      .getByRole("button", { name: "Delete Edition", exact: true })
      .click();
    const confirm = page.getByRole("alertdialog", {
      name: `Delete Kalakriti ${DELETE_YEAR}?`,
    });
    await confirm
      .getByRole("button", { name: "Delete Edition", exact: true })
      .click();
    await expect(
      page.getByText(`Kalakriti ${DELETE_YEAR} deleted`, { exact: true })
    ).toBeVisible();
    await expect(page).not.toHaveURL(new RegExp(`/kalakriti/${DELETE_YEAR}`));
    await expect(fixture("state", String(DELETE_YEAR))).resolves.toBeNull();
    await expect(fixture("event-exists", created.teamEventId)).resolves.toBe(
      false
    );
  } finally {
    await page.goto("about:blank");
    await fixture("cleanup", String(DELETE_YEAR));
  }
});

test("rolls back both sides of failed Edition creation", async ({
  baseURL,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Super-admin Edition rollback flow"
  );
  const setup = await fixture<{
    existingEditionId: string;
    existingEventId: string;
    failedEditionAuditId: string;
    failedEditionEventId: string;
    failedLinkedEventAuditId: string;
    failedLinkedEventEditionId: string;
    teamId: string;
  }>("rollback-setup");
  const now = Date.now();

  try {
    const linkedEventFailure = await mutateEditionCreate(page, baseURL, {
      ageCutoffDate: "2193-06-30",
      auditEntryId: setup.failedLinkedEventAuditId,
      brandingKey: "kalakriti-2193",
      editionId: setup.failedLinkedEventEditionId,
      eventDate: "2193-11-21",
      name: "Kalakriti 2193",
      now,
      plannedRegistrationCloseAt: Date.parse("2193-10-31T12:30:00.000Z"),
      teamEventId: setup.existingEventId,
      teamId: setup.teamId,
      year: 2193,
    });
    expect(linkedEventFailure.mutations[0].result.error).toBe("app");

    const editionFailure = await mutateEditionCreate(page, baseURL, {
      ageCutoffDate: "2194-06-30",
      auditEntryId: setup.failedEditionAuditId,
      brandingKey: "kalakriti-2194",
      editionId: setup.existingEditionId,
      eventDate: "2194-11-21",
      name: "Kalakriti 2194",
      now,
      plannedRegistrationCloseAt: Date.parse("2194-10-31T12:30:00.000Z"),
      teamEventId: setup.failedEditionEventId,
      teamId: setup.teamId,
      year: 2194,
    });
    expect(editionFailure.mutations[0].result.error).toBe("app");

    await expect(
      fixture<{
        failedEditionEventExists: boolean;
        failedLinkedEventEditionExists: boolean;
      }>("rollback-state")
    ).resolves.toEqual({
      failedEditionEventExists: false,
      failedLinkedEventEditionExists: false,
    });
  } finally {
    await fixture("rollback-cleanup");
  }
});
