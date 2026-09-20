import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type {
  APIRequestContext,
  Browser,
  BrowserContext,
  Locator,
  Page,
} from "@playwright/test";
import { uuidv7 } from "uuidv7";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const execFileAsync = promisify(execFile);
const helper = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-awards.ts"
);

test.use({
  storageState: path.resolve(
    import.meta.dirname,
    "../../.auth/super_admin.json"
  ),
  actionTimeout: 15_000,
});

interface AwardsFixture {
  year: number;
  editionId: string;
  groupDivisionId: string;
  groupWinnerEntryId: string;
  groupRunnerEntryId: string;
  groupAlternateEntryId: string;
  groupResultId: string;
  groupScorecardId: string;
  replacementScorecardId: string;
  individualDivisionId: string;
  individualWinnerEntryId: string;
  individualRunnerEntryId: string;
  studentAId: string;
  studentBId: string;
  studentCId: string;
  studentDId: string;
  studentEId: string;
  studentFId: string;
}

interface AwardsState {
  handovers: Array<{
    award: "winner" | "runner_up";
    awarded: boolean;
    entryId: string;
    studentId: string;
    version: number;
  }>;
  commandCount: number;
  groupResult: { status: string; version: number; winnerEntryId: string };
}

async function fixture<T>(action: string, value?: string): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helper, action, ...(value ? [value] : [])],
    { env: process.env, timeout: 60_000, killSignal: "SIGKILL" }
  );
  return JSON.parse(stdout.trim()) as T;
}

async function mutate(
  request: APIRequestContext,
  name: string,
  args: Record<string, unknown>
): Promise<{ error?: string; message?: string }> {
  const id = uuidv7();
  const response = await request.post(
    "/api/zero/mutate?schema=zero_0&appID=zero",
    {
      data: {
        clientGroupID: `awards-${id}`,
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

function awardCommand(
  data: AwardsFixture,
  values: {
    award: "winner" | "runner_up";
    awarded: boolean;
    commandId?: string;
    divisionId: string;
    editionId?: string;
    entryId: string;
    expectedVersions: Array<{ studentId: string; version: number }>;
    studentId?: string;
  }
) {
  return {
    ...values,
    commandId: values.commandId ?? uuidv7(),
    editionId: values.editionId ?? data.editionId,
    now: Date.now(),
  };
}

async function actorPage(
  browser: Browser,
  baseURL: string | undefined,
  storageState: string | undefined,
  contexts: BrowserContext[],
  year: number
) {
  if (!storageState) throw new Error("Missing actor authentication state");
  const context = await browser.newContext({ baseURL, storageState });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(`/kalakriti/${year}/awards`);
  await waitForZeroReady(page);
  return page;
}

function awardRow(page: Page, competition: string, award: string): Locator {
  return page
    .getByRole("row")
    .filter({ hasText: competition })
    .filter({ hasText: award })
    .first();
}

async function expectMetric(page: Page, label: string, value: number) {
  const summary = page.getByRole("group", { name: "Award handover summary" });
  const metric = summary.locator("dl").filter({
    has: page.getByText(label, { exact: true }),
  });
  await expect(metric.locator("dd").first()).toHaveText(String(value));
}

async function selectFilter(page: Page, field: string, value: string) {
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("option", { exact: true, name: field }).click();
  await page.getByRole("option", { exact: true, name: "is" }).click();
  await page.getByRole("option", { exact: true, name: value }).click();
}

async function desktopAction(
  page: Page,
  triggerName: string,
  actionName: string
) {
  await page.getByRole("button", { name: triggerName, exact: true }).click();
  await page.getByRole("menuitem", { name: actionName, exact: true }).click();
}

test.describe("Kalakriti Awards handovers", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(() =>
    test.skip(
      test.info().project.name !== "kalakriti_release_invariants",
      "Awards uses an isolated Live Edition in the serialized invariant lane"
    )
  );
  test.afterEach(async () => {
    await fixture("cleanup");
  });

  test("publishes recipients, tracks individual and group handovers, and protects awarded results", async ({
    baseURL,
    browser,
    kalakritiActors,
    page,
    superAdminEmail,
  }) => {
    test.slow();
    const data = await fixture<AwardsFixture>("setup", superAdminEmail);
    const contexts: BrowserContext[] = [];
    try {
      const lead = await actorPage(
        browser,
        baseURL,
        kalakritiActors.categoryLead.storageState,
        contexts,
        data.year
      );
      await expect(
        lead.getByRole("heading", { name: "Awards", exact: true })
      ).toBeVisible();
      await expectMetric(lead, "Total recipients", 2);
      await expectMetric(lead, "Awarded", 0);
      await expectMetric(lead, "Pending", 2);
      await expect(
        lead.getByText("Awards Drawing", { exact: true })
      ).toHaveCount(2);
      await expect(
        lead.getByText("Awards Group Dance", { exact: true })
      ).toHaveCount(0);
      await expect(
        lead.getByText("Awards Draft Singing", { exact: true })
      ).toHaveCount(0);

      const published = await mutate(page.request, "kalakritiResult.save", {
        editionId: data.editionId,
        divisionId: data.groupDivisionId,
        resultId: data.groupResultId,
        revisionId: uuidv7(),
        expectedVersion: 1,
        now: Date.now(),
        status: "published",
        winnerEntryId: data.groupWinnerEntryId,
        runnerUpEntryId: data.groupRunnerEntryId,
        scorecardIds: [data.groupScorecardId],
        uploads: [],
      });
      expect(published.error).toBeUndefined();
      await lead.reload();
      await waitForZeroReady(lead);
      await expectMetric(lead, "Total recipients", 6);
      await expectMetric(lead, "Pending", 6);

      const search = lead.getByPlaceholder("Search award recipients...");
      await search.fill("Award Student A");
      await expect(lead.getByTestId("row-title")).toHaveCount(2);
      await search.clear();
      await selectFilter(lead, "Type", "Group");
      await expect(lead.getByTestId("row-title")).toHaveCount(2);
      await lead.getByRole("button", { name: "Clear", exact: true }).click();
      await expect(lead.getByTestId("row-title")).toHaveCount(4);
      await expect(
        lead.getByText("Rows per page", { exact: true })
      ).toBeVisible();

      const individualWinner = awardRow(lead, "Awards Drawing", "Winner");
      await desktopAction(
        lead,
        "Actions for Award Student A",
        "View student ID"
      );
      const studentDetail = lead.getByRole("dialog", {
        name: "Award Student A",
      });
      await expect(studentDetail.getByText("KAL-2175-0001")).toBeVisible();
      await studentDetail.getByRole("button", { name: "Close" }).click();
      await desktopAction(lead, "Actions for Award Student A", "Award prize");
      await expect(
        individualWinner.getByText("Awarded", { exact: true })
      ).toBeVisible();
      await expectMetric(lead, "Awarded", 1);

      let groupWinner = awardRow(lead, "Awards Group Dance", "Winner");
      await groupWinner.getByTestId("row-expand").click();
      const winnerMembers = lead.getByRole("table", {
        name: "Awards Group Dance Winner recipients",
      });
      const studentB = winnerMembers
        .getByRole("row")
        .filter({ hasText: "Award Student B" });
      await studentB
        .getByRole("button", { name: "Actions for Award Student B" })
        .click();
      await lead.getByRole("menuitem", { name: "Award prize" }).click();
      await expect(groupWinner.getByText("Partially awarded")).toBeVisible();
      await expect(
        groupWinner.getByText("1 of 2", { exact: true })
      ).toBeVisible();
      await expectMetric(lead, "Awarded", 2);
      await desktopAction(
        lead,
        "Actions for Awards Group Dance Winner",
        "Award whole group"
      );
      await expect(
        groupWinner.getByText("Awarded", { exact: true })
      ).toBeVisible();
      await expect(
        groupWinner.getByText("2 of 2", { exact: true })
      ).toBeVisible();
      await expectMetric(lead, "Awarded", 3);

      const scorecardOnly = await mutate(page.request, "kalakritiResult.save", {
        editionId: data.editionId,
        divisionId: data.groupDivisionId,
        resultId: data.groupResultId,
        revisionId: uuidv7(),
        expectedVersion: 2,
        now: Date.now(),
        status: "published",
        winnerEntryId: data.groupWinnerEntryId,
        runnerUpEntryId: data.groupRunnerEntryId,
        scorecardIds: [data.replacementScorecardId],
        uploads: [],
      });
      expect(scorecardOnly.error).toBeUndefined();
      expect(
        (await fixture<AwardsState>("state")).handovers.filter(
          (handover) =>
            handover.entryId === data.groupWinnerEntryId && handover.awarded
        )
      ).toHaveLength(2);

      const blockedCorrection = await mutate(
        page.request,
        "kalakritiResult.save",
        {
          editionId: data.editionId,
          divisionId: data.groupDivisionId,
          resultId: data.groupResultId,
          revisionId: uuidv7(),
          expectedVersion: 3,
          now: Date.now(),
          status: "published",
          winnerEntryId: data.groupAlternateEntryId,
          runnerUpEntryId: data.groupRunnerEntryId,
          scorecardIds: [data.replacementScorecardId],
          uploads: [],
        }
      );
      expect(blockedCorrection.error).toBeDefined();
      expect(blockedCorrection.message?.toLowerCase()).toContain("undo");

      await desktopAction(
        lead,
        "Actions for Awards Group Dance Winner",
        "Undo whole group"
      );
      await expect(
        groupWinner.getByText("Pending", { exact: true })
      ).toBeVisible();
      await expectMetric(lead, "Awarded", 1);
      const corrected = await mutate(page.request, "kalakritiResult.save", {
        editionId: data.editionId,
        divisionId: data.groupDivisionId,
        resultId: data.groupResultId,
        revisionId: uuidv7(),
        expectedVersion: 3,
        now: Date.now(),
        status: "published",
        winnerEntryId: data.groupAlternateEntryId,
        runnerUpEntryId: data.groupRunnerEntryId,
        scorecardIds: [data.replacementScorecardId],
        uploads: [],
      });
      expect(corrected.error).toBeUndefined();

      await lead.setViewportSize({ width: 390, height: 844 });
      await lead.reload();
      await waitForZeroReady(lead);
      groupWinner = awardRow(lead, "Awards Group Dance", "Runner-up");
      await lead
        .getByRole("button", {
          name: "Actions for Awards Group Dance Runner-up",
        })
        .click();
      const mobileActions = lead.getByRole("dialog", {
        name: "Awards Group Dance Runner-up actions",
      });
      await mobileActions
        .getByRole("button", { name: "Award whole group" })
        .click();
      await expect(
        groupWinner.getByText("Awarded", { exact: true })
      ).toBeVisible();
      await expectMetric(lead, "Awarded", 3);
      await expect(
        lead.getByRole("dialog", {
          name: "Awards Group Dance Runner-up actions",
        })
      ).toBeHidden();

      await fixture("finalize");
      const memberContext = await browser.newContext({
        baseURL,
        storageState: kalakritiActors.volunteerCoordinator.storageState,
      });
      contexts.push(memberContext);
      const finalizedAward = await mutate(
        memberContext.request,
        "kalakritiAward.set",
        awardCommand(data, {
          award: "winner",
          awarded: true,
          divisionId: data.groupDivisionId,
          entryId: data.groupAlternateEntryId,
          expectedVersions: [
            { studentId: data.studentEId, version: 0 },
            { studentId: data.studentFId, version: 0 },
          ],
        })
      );
      expect(finalizedAward.error).toBeUndefined();
      await expect
        .poll(
          async () =>
            (await fixture<AwardsState>("state")).handovers.filter(
              (handover) =>
                handover.entryId === data.groupAlternateEntryId &&
                handover.awarded
            ).length
        )
        .toBe(2);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });

  test("enforces role scope and durable retry and stale-write contracts", async ({
    baseURL,
    browser,
    kalakritiActors,
    page,
    superAdminEmail,
  }) => {
    test.slow();
    const data = await fixture<AwardsFixture>("setup", superAdminEmail);
    const contexts: BrowserContext[] = [];
    try {
      const member = await actorPage(
        browser,
        baseURL,
        kalakritiActors.volunteerCoordinator.storageState,
        contexts,
        data.year
      );
      await expect(
        member.getByRole("heading", { name: "Awards", exact: true })
      ).toBeVisible();
      const editionAdmin = await actorPage(
        browser,
        baseURL,
        kalakritiActors.editionAdmin.storageState,
        contexts,
        data.year
      );
      await expect(
        editionAdmin.getByRole("heading", { name: "Awards", exact: true })
      ).toBeVisible();
      const unrelated = await actorPage(
        browser,
        baseURL,
        kalakritiActors.unrelatedVolunteer.storageState,
        contexts,
        data.year
      );
      await expect(
        unrelated.getByRole("heading", { name: "Page not found" })
      ).toBeVisible();

      const winner = awardCommand(data, {
        award: "winner",
        awarded: true,
        divisionId: data.individualDivisionId,
        entryId: data.individualWinnerEntryId,
        expectedVersions: [{ studentId: data.studentAId, version: 0 }],
        studentId: data.studentAId,
      });
      expect(
        (await mutate(page.request, "kalakritiAward.set", winner)).error
      ).toBeUndefined();
      expect(
        (
          await mutate(
            editionAdmin.request,
            "kalakritiAward.set",
            awardCommand(data, {
              award: "winner",
              awarded: false,
              divisionId: data.individualDivisionId,
              entryId: data.individualWinnerEntryId,
              expectedVersions: [{ studentId: data.studentAId, version: 1 }],
              studentId: data.studentAId,
            })
          )
        ).error
      ).toBeUndefined();

      const commandId = uuidv7();
      const runner = awardCommand(data, {
        award: "runner_up",
        awarded: true,
        commandId,
        divisionId: data.individualDivisionId,
        entryId: data.individualRunnerEntryId,
        expectedVersions: [{ studentId: data.studentCId, version: 0 }],
        studentId: data.studentCId,
      });
      expect(
        (await mutate(member.request, "kalakritiAward.set", runner)).error
      ).toBeUndefined();
      expect(
        (await mutate(member.request, "kalakritiAward.set", runner)).error
      ).toBeUndefined();
      const retried = await fixture<AwardsState>("state");
      expect(
        retried.handovers.find(
          (handover) => handover.studentId === data.studentCId
        )
      ).toMatchObject({ awarded: true, version: 1 });
      expect(retried.commandCount).toBe(3);

      const stale = await mutate(
        member.request,
        "kalakritiAward.set",
        awardCommand(data, {
          award: "runner_up",
          awarded: false,
          divisionId: data.individualDivisionId,
          entryId: data.individualRunnerEntryId,
          expectedVersions: [{ studentId: data.studentCId, version: 0 }],
          studentId: data.studentCId,
        })
      );
      expect(stale.message).toContain("Awards changed");
      const mismatchedRetry = await mutate(
        member.request,
        "kalakritiAward.set",
        { ...runner, awarded: false }
      );
      expect(mismatchedRetry.message).toContain("already used");

      const unauthorized = await mutate(
        unrelated.request,
        "kalakritiAward.set",
        awardCommand(data, {
          award: "runner_up",
          awarded: false,
          divisionId: data.individualDivisionId,
          entryId: data.individualRunnerEntryId,
          expectedVersions: [{ studentId: data.studentCId, version: 1 }],
          studentId: data.studentCId,
        })
      );
      expect(unauthorized.message).toContain("Unauthorized");

      const leadContext = await browser.newContext({
        baseURL,
        storageState: kalakritiActors.categoryLead.storageState,
      });
      contexts.push(leadContext);
      const crossEdition = await mutate(
        leadContext.request,
        "kalakritiAward.set",
        awardCommand(data, {
          award: "runner_up",
          awarded: false,
          divisionId: data.individualDivisionId,
          editionId: uuidv7(),
          entryId: data.individualRunnerEntryId,
          expectedVersions: [{ studentId: data.studentCId, version: 1 }],
          studentId: data.studentCId,
        })
      );
      expect(crossEdition.error).toBeDefined();

      await fixture("revoke-lead");
      const revoked = await mutate(
        leadContext.request,
        "kalakritiAward.set",
        awardCommand(data, {
          award: "runner_up",
          awarded: false,
          divisionId: data.individualDivisionId,
          entryId: data.individualRunnerEntryId,
          expectedVersions: [{ studentId: data.studentCId, version: 1 }],
          studentId: data.studentCId,
        })
      );
      expect(revoked.message).toContain("Unauthorized");
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
