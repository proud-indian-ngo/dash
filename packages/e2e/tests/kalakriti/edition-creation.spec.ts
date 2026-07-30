import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "../../fixtures/test";
import { KalakritiEditionPage } from "../../pages/kalakriti-edition-page";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-edition-creation.ts"
);
const YEAR = 2094;

type FixtureAction =
  | "cleanup"
  | "rollback-cleanup"
  | "rollback-setup"
  | "rollback-state"
  | "state";

async function fixture<T>(action: FixtureAction) {
  const { stdout } = await execFileAsync("bun", ["run", helperPath, action], {
    env: process.env,
  });
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
      name: `Kalakriti ${YEAR} Revised`,
      plannedRegistrationCloseAt: `${YEAR}-10-31T12:30:00.000Z`,
      year: YEAR,
    });
    expect(state.editionId).not.toBe(state.teamEventId);
  } finally {
    await fixture("cleanup");
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
