import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { Browser, BrowserContext, Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { registrationCleanup } from "../../helpers/registration-cleanup";

const execFileAsync = promisify(execFile);
const helper = path.resolve(
  import.meta.dirname,
  "../../helpers/role-dashboard-fixture.ts"
);

async function fixture<T>(action: string, value?: string): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helper, action, ...(value ? [value] : [])],
    { env: process.env, timeout: 60_000, killSignal: "SIGKILL" }
  );
  return JSON.parse(stdout.trim()) as T;
}

async function actorPage(
  browser: Browser,
  baseURL: string | undefined,
  storageState: string | undefined,
  contexts: BrowserContext[],
  year: number
): Promise<Page> {
  if (!storageState) throw new Error("Missing actor authentication state");
  const context = await browser.newContext({ baseURL, storageState });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(`/kalakriti/${year}`);
  await waitForZeroReady(page);
  await expect(
    page.getByRole("heading", { name: "Your event-day workspace" })
  ).toBeVisible();
  return page;
}

test("role dashboards show scoped work, linked actions, and a useful future-role overview", async ({
  baseURL,
  browser,
  kalakritiActors,
  superAdminEmail,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "kalakriti_release_invariants",
    "Serialized live Edition lane"
  );
  test.slow();
  const contexts: BrowserContext[] = [];
  let failed = true;
  try {
    const { year, guardianEmail, guardianPassword } = await fixture<{
      year: number;
      guardianEmail: string;
      guardianPassword: string;
    }>("setup", superAdminEmail);
    const admin = await actorPage(
      browser,
      baseURL,
      path.resolve(import.meta.dirname, "../../.auth/super_admin.json"),
      contexts,
      year
    );
    await expect(
      admin.getByRole("heading", { name: "Participation", exact: true })
    ).toBeVisible();
    await expect(
      admin.getByRole("heading", { name: "Inventory", exact: true })
    ).toBeVisible();
    await expect(
      admin.getByRole("heading", { name: "Meals", exact: true })
    ).toBeVisible();
    await expect(
      admin.getByRole("heading", { name: "Check-in", exact: true })
    ).toBeVisible();

    await admin.setViewportSize({ width: 390, height: 844 });
    await admin.goto(`/kalakriti/${year}/competitions`);
    await waitForZeroReady(admin);
    const emptySessions = admin.getByText("No Competitions configured.");
    await expect(emptySessions).toBeVisible();
    await expect(
      admin.getByText("0 of 0 results", { exact: true })
    ).toBeVisible();
    const emptyBox = await emptySessions.boundingBox();
    expect(emptyBox).not.toBeNull();
    expect(emptyBox!.x).toBeGreaterThanOrEqual(0);
    expect(emptyBox!.x + emptyBox!.width).toBeLessThanOrEqual(390);

    const guardianContext = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    contexts.push(guardianContext);
    const guardian = await guardianContext.newPage();
    await guardian.goto("/login");
    await guardian.getByLabel("Email").fill(guardianEmail);
    await guardian.getByLabel("Password").fill(guardianPassword);
    await guardian.getByRole("button", { name: "Login", exact: true }).click();
    await guardian.waitForURL((url) => !url.pathname.startsWith("/login"));
    await guardian.goto(`/kalakriti/${year}`);
    await waitForZeroReady(guardian);
    await expect(
      guardian.getByRole("heading", { name: "Your event-day workspace" })
    ).toBeVisible();
    await expect(
      guardian.getByRole("heading", { name: "Participation", exact: true })
    ).toBeVisible();
    await expect(
      guardian.getByText("Assigned Centers", { exact: true }).first()
    ).toBeVisible();
    await expect(
      guardian.getByRole("heading", { name: "Inventory", exact: true })
    ).toHaveCount(0);
    await expect(
      guardian.getByRole("heading", { name: "Check-in", exact: true })
    ).toHaveCount(0);
    await guardian.goto(`/kalakriti/${year}/students`);
    await waitForZeroReady(guardian);
    await expect(
      guardian.getByText("Students in your authorized Centers", { exact: true })
    ).toBeVisible();
    await guardian
      .getByRole("button", {
        name: "Show without entries in table",
        exact: true,
      })
      .click();
    await expect(
      guardian.getByRole("group", { name: "Entries equals 0", exact: true })
    ).toBeVisible();
    await expect(
      guardian.getByRole("cell", { name: /^Dashboard Student/ })
    ).toBeVisible();
    await guardian.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(
      guardian.getByRole("group", { name: "Entries equals 0", exact: true })
    ).toHaveCount(0);

    const operator = await actorPage(
      browser,
      baseURL,
      kalakritiActors.categoryLead.storageState,
      contexts,
      year
    );
    await expect(
      operator.getByRole("heading", { name: "Meals", exact: true })
    ).toBeVisible();
    await expect(
      operator.getByRole("heading", { name: "Transport", exact: true })
    ).toBeVisible();
    await expect(
      operator.getByRole("button", { name: "Serve meals" })
    ).toHaveCount(1);
    await expect(
      operator.getByRole("button", { name: "Scan transport" })
    ).toHaveCount(1);
    const pending = operator.getByText("Breakfast pending", { exact: true });
    await expect(pending).toBeVisible();
    await pending
      .locator("xpath=ancestor::*[@data-slot='item']")
      .getByRole("button", { name: "Review" })
      .click();
    await expect(operator).toHaveURL(
      (url) =>
        url.pathname === `/kalakriti/${year}/food` &&
        url.searchParams.get("dashboardFilter") === "breakfast_pending"
    );
    await expect(
      operator.getByRole("button", {
        name: "Review Awaiting breakfast",
        exact: true,
      })
    ).toBeVisible();
    await expect(
      operator.getByRole("group", {
        name: "Breakfast is Not served",
        exact: true,
      })
    ).toBeVisible();
    await operator.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(
      operator.getByRole("group", {
        name: "Breakfast is Not served",
        exact: true,
      })
    ).toHaveCount(0);
    await expect(
      operator.getByRole("button", { name: "Serve meals", exact: true })
    ).toHaveCount(1);

    const future = await actorPage(
      browser,
      baseURL,
      kalakritiActors.unrelatedVolunteer.storageState,
      contexts,
      year
    );
    await expect(
      future.getByText("Awards Member", { exact: true })
    ).toBeVisible();
    await expect(future.getByText("Your Edition at a glance")).toBeVisible();
    await expect(
      future.getByRole("button", { name: "View schedule" })
    ).toBeVisible();
    await expect(
      future.getByRole("heading", { name: "Center standings" })
    ).toBeVisible();
    await expect(
      future.getByRole("heading", { name: "Meals", exact: true })
    ).toHaveCount(0);
    failed = false;
  } finally {
    await registrationCleanup(
      [
        ...contexts.map((context) => () => context.close()),
        () => fixture("cleanup"),
      ],
      failed,
      testInfo
    );
  }
});
