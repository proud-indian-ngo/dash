import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { APIRequestContext } from "@playwright/test";
import { uuidv7 } from "uuidv7";

import { expect, test } from "../../fixtures/test";
import { KalakritiResultsPage } from "../../pages/kalakriti-results-page";

test.use({
  storageState: path.resolve(
    import.meta.dirname,
    "../../.auth/super_admin.json"
  ),
  actionTimeout: 15_000,
});

const execFileAsync = promisify(execFile);
interface Setup {
  guardianEmail: string;
  guardianPassword: string;
  year: number;
  editionId: string;
  divisionId: string;
  groupEntryId: string;
  secondGroupEntryId: string;
  centerAId: string;
  centerBId: string;
  scorecardId: string;
  resultId: string;
}
interface ResultState {
  result: {
    status: string;
    version: number;
    winnerEntryId: string | null;
    runnerUpEntryId: string | null;
  } | null;
  resultsState: { version: number; finalizedAt: string | null } | null;
  revisionCount: number;
  scorecardFiles: { id: string; objectKey: string }[];
}

async function fixture<T>(action: string, ...args: string[]): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(import.meta.dirname, "../../helpers/kalakriti-results.ts"),
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
): Promise<{ error?: string; message?: string }> {
  const id = uuidv7();
  const response = await request.post(
    "/api/zero/mutate?schema=zero_0&appID=zero",
    {
      data: {
        clientGroupID: `results-${id}`,
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
  return body.mutations[0].result;
}

test("scorecard-backed results publish only after group attendance, then finalize and reopen Center standings", async ({
  baseURL,
  browser,
  page,
  superAdminEmail,
  volunteerEmail,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "kalakriti_release_invariants",
    "Serialized live Edition lane"
  );
  test.slow();
  const data = await fixture<Setup>("setup", superAdminEmail, volunteerEmail);
  const coordinatorContext = await browser.newContext({
    baseURL,
    storageState: path.resolve(
      import.meta.dirname,
      "../../.auth/volunteer.json"
    ),
  });
  const guardianContext = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  try {
    const signIn = await guardianContext.request.post(
      "/api/auth/sign-in/email",
      {
        data: { email: data.guardianEmail, password: data.guardianPassword },
        headers: { "x-forwarded-for": "192.0.2.217" },
      }
    );
    expect(signIn.ok()).toBe(true);
    const admin = new KalakritiResultsPage(page);
    await admin.gotoEvent(data.year, data.divisionId);
    await admin.openResults();
    await expect(admin.results.getByText("judge.pdf")).toBeVisible();
    await admin.chooseAward("Winner", "Results Student C");
    await admin.results.getByRole("button", { name: "Cancel changes" }).click();
    await expect(admin.results).toBeHidden();
    await expect(
      admin.page.getByRole("button", { name: "Assign results" })
    ).toBeFocused();
    await admin.openResults();
    await expect(
      admin.results.getByRole("combobox", { name: "Winner", exact: true })
    ).toContainText("Choose an entry");
    await admin.chooseAward("Winner", "Results Student C");
    await admin.saveDraft();
    await expect
      .poll(async () => (await fixture<ResultState>("state")).result?.version)
      .toBe(2);

    const incomplete = await mutate(page.request, "kalakritiResult.save", {
      editionId: data.editionId,
      divisionId: data.divisionId,
      resultId: data.resultId,
      revisionId: uuidv7(),
      expectedVersion: 2,
      now: Date.now(),
      status: "published",
      winnerEntryId: data.groupEntryId,
      runnerUpEntryId: data.secondGroupEntryId,
      scorecardIds: [data.scorecardId],
      uploads: [],
    });
    expect(incomplete.error).toBeDefined();
    expect(incomplete.message).toContain("attendance");
    expect((await fixture<ResultState>("state")).result?.status).toBe("draft");

    await fixture("complete-attendance", superAdminEmail);
    await admin.gotoEvent(data.year, data.divisionId);
    await admin.openResults();
    await admin.chooseAward("Winner", "Results Student A");
    await admin.chooseAward("Runner-up", "Results Student C");
    await admin.publish();
    await expect
      .poll(async () => (await fixture<ResultState>("state")).result?.status)
      .toBe("published");
    await admin.gotoDashboard(data.year);
    await admin.expectCompetitionAwards();
    await expect(
      admin.standings.getByText("1 of 1 competitions published")
    ).toBeVisible();
    await expect(
      admin.standings.getByText("Leading: Results Center A")
    ).toBeVisible();
    const rows = admin.standings.getByRole("row");
    await expect(rows.filter({ hasText: "Results Center A" })).toContainText(
      "10"
    );
    await expect(rows.filter({ hasText: "Results Center B" })).toContainText(
      "5"
    );

    const coordinator = new KalakritiResultsPage(
      await coordinatorContext.newPage()
    );
    await coordinator.gotoEvent(data.year, data.divisionId);
    await coordinator.openResults();
    await expect(
      coordinator.results.getByText("Published", { exact: true })
    ).toBeVisible();
    await coordinator.gotoDashboard(data.year);
    await expect(
      coordinator.standings.getByRole("button", {
        name: "Finalize overall results",
      })
    ).toHaveCount(0);
    const published = await fixture<ResultState>("state");
    expect(
      (
        await mutate(coordinator.page.request, "kalakritiResult.finalize", {
          editionId: data.editionId,
          revisionId: uuidv7(),
          expectedVersion: published.resultsState?.version,
          now: Date.now(),
          winnerCenterId: data.centerAId,
          runnerUpCenterId: data.centerBId,
          tieReason: null,
        })
      ).error
    ).toBeDefined();
    expect(
      (
        await mutate(coordinator.page.request, "kalakritiResult.save", {
          editionId: data.editionId,
          divisionId: uuidv7(),
          resultId: uuidv7(),
          revisionId: uuidv7(),
          expectedVersion: 0,
          now: Date.now(),
          status: "draft",
          winnerEntryId: null,
          runnerUpEntryId: null,
          scorecardIds: [],
          uploads: [],
        })
      ).error
    ).toBeDefined();
    expect(
      (
        await mutate(coordinator.page.request, "kalakritiResult.save", {
          editionId: data.editionId,
          divisionId: data.divisionId,
          resultId: data.resultId,
          revisionId: uuidv7(),
          expectedVersion: 1,
          now: Date.now(),
          status: "published",
          winnerEntryId: data.groupEntryId,
          runnerUpEntryId: data.secondGroupEntryId,
          scorecardIds: [data.scorecardId],
          uploads: [],
        })
      ).error
    ).toBeDefined();

    const guardian = new KalakritiResultsPage(await guardianContext.newPage());
    await guardian.gotoDashboard(data.year);
    await guardian.expectCompetitionAwards();
    await expect(
      guardian.standings.getByText("Leading: Results Center A")
    ).toBeVisible();
    const denied = await guardian.page.request.get(
      `/api/attachments/download?kind=kalakritiScorecard&id=${data.scorecardId}`
    );
    expect(denied.status()).toBe(403);

    await admin.finalize();
    await expect(
      admin.standings.getByText(/Overall winner: Results Center A/)
    ).toBeVisible();
    await expect(
      admin.standings.getByText(/Overall runner-up: Results Center B/)
    ).toBeVisible();
    await guardian.gotoDashboard(data.year);
    await expect(
      guardian.standings.getByText(/Overall winner: Results Center A/)
    ).toBeVisible();
    await admin.reopen();
    await expect(
      admin.standings.getByText("Leading: Results Center A")
    ).toBeVisible();
    expect(
      (await fixture<ResultState>("state")).resultsState?.finalizedAt
    ).toBeNull();
  } finally {
    await Promise.all([coordinatorContext.close(), guardianContext.close()]);
    await fixture("cleanup");
  }
});

test("failed scorecard PUT can retry while a successful staged file stays attached", async ({
  page,
  superAdminEmail,
  volunteerEmail,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "kalakriti_release_invariants",
    "Serialized live Edition lane"
  );
  test.skip(
    Boolean(process.env.CI),
    "Requires real R2 promotion, following the local-only music upload test"
  );
  test.setTimeout(240_000);
  const data = await fixture<Setup>("setup", superAdminEmail, volunteerEmail);
  const uploadedKeys = new Set<string>();
  let aborted = false;
  let successfulFilePuts = 0;
  page.on("request", (request) => {
    if (
      request.method() !== "PUT" ||
      !request.url().includes("r2.cloudflarestorage.com")
    )
      return;
    let key = decodeURIComponent(new URL(request.url()).pathname).slice(1);
    const bucket = `${process.env.R2_BUCKET_NAME}/`;
    if (key.startsWith(bucket)) key = key.slice(bucket.length);
    uploadedKeys.add(key);
  });
  try {
    const results = new KalakritiResultsPage(page);
    await results.gotoEvent(data.year, data.divisionId);
    await results.openResults();
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (
        request.method() === "PUT" &&
        decodeURIComponent(request.url()).includes("results-retry.pdf") &&
        !aborted
      ) {
        aborted = true;
        await route.abort();
        return;
      }
      if (
        request.method() === "PUT" &&
        decodeURIComponent(request.url()).includes("results-good.pdf")
      )
        successfulFilePuts++;
      await route.continue();
    });
    const pdf = (name: string) => ({
      name,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"),
    });
    await results.results
      .getByLabel("Upload judge scorecards")
      .setInputFiles([pdf("results-retry.pdf"), pdf("results-good.pdf")]);
    await expect(results.results.getByRole("alert")).toContainText(
      "results-retry.pdf"
    );
    await expect(
      results.results.getByText("results-good.pdf · Ready")
    ).toBeVisible();
    await results.results.getByRole("button", { name: "Retry" }).click();
    await expect(
      results.results.getByText("results-retry.pdf · Ready")
    ).toBeVisible();
    await expect(
      results.results.getByText("results-good.pdf · Ready")
    ).toBeVisible();
    expect(successfulFilePuts).toBe(1);
    await results.saveDraft();
    await expect
      .poll(
        async () => (await fixture<ResultState>("state")).scorecardFiles.length
      )
      .toBe(3);
    for (const file of (await fixture<ResultState>("state")).scorecardFiles) {
      if (file.id !== data.scorecardId) uploadedKeys.add(file.objectKey);
    }
    await fixture("complete-attendance", superAdminEmail);
    await results.gotoEvent(data.year, data.divisionId);
    await results.openResults();
    await results.chooseAward("Winner", "Results Student A");
    await results.chooseAward("Runner-up", "Results Student C");
    await results.publish();
    await results.gotoDashboard(data.year);
    await expect(
      results.standings.getByText("1 of 1 competitions published")
    ).toBeVisible();
    await results.finalize();
    await results.reopen();
  } finally {
    await page.goto("about:blank");
    await fixture("cleanup");
    if (uploadedKeys.size)
      await fixture(
        "cleanup-r2",
        JSON.stringify([...uploadedKeys]),
        superAdminEmail
      );
  }
});
