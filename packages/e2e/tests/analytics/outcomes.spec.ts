import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/outcomes.ts"
);

async function fixture<T>(action: "cleanup" | "setup", args: string[] = []) {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...args],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

test.describe("Analytics outcomes", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(({ page: _page }, testInfo) => {
    // The hourly value is one app-wide setting, so one project owns it.
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });
  test.afterAll(async ({ browserName: _browserName }, testInfo) => {
    if (testInfo.project.name === "super_admin") {
      await fixture("cleanup");
    }
  });

  test("a recorded session shows in the tiles, then valued once an hourly value is set", async ({
    adminEmail,
    page,
    superAdminEmail,
    volunteerEmail,
  }) => {
    test.slow();
    const { teamId } = await fixture<{ teamId: string }>("setup", [
      superAdminEmail,
      adminEmail,
      volunteerEmail,
    ]);
    const outcomesUrl = `/analytics?tab=outcomes&team=${teamId}`;

    await page.goto(outcomesUrl);
    await waitForZeroReady(page);
    const tile = (name: string) => page.getByRole("region", { name });
    const value = (name: string) =>
      tile(name).locator("[data-slot='outcome-value']");
    await expect(value("Events held")).toHaveText("1", { timeout: 15_000 });
    await expect(value("Children reached")).toHaveText("17");
    // Two present volunteers × two hours; the absent one adds nothing.
    await expect(value("Volunteer hours")).toHaveText("4");
    await expect(
      page.getByText("Every event in this period has a recap and attendance.")
    ).toBeVisible();
    const setValue = tile("Value of volunteer time").getByRole("link", {
      name: "Set an hourly value",
    });
    await expect(setValue).toBeVisible();

    await setValue.click();
    await page.waitForURL("**/settings/programmes");
    const card = page.getByRole("region", { name: "Volunteer time" });
    await expect(card).toContainText("Hourly value: not set", {
      timeout: 15_000,
    });
    await card
      .getByRole("button", { name: "Edit volunteer hour value" })
      .click();
    await card.getByLabel("Value of a volunteer hour (₹)").fill("250");
    await card.getByRole("button", { name: "Save value" }).click();
    await expect(card).toContainText("Hourly value: ₹250", {
      timeout: 10_000,
    });

    await page.goto(outcomesUrl);
    await waitForZeroReady(page);
    await expect(value("Value of volunteer time")).toHaveText("₹1,000", {
      timeout: 15_000,
    });
    await expect(tile("Value of volunteer time")).toContainText(
      "At ₹250 an hour"
    );
  });
});

test.describe("Analytics outcomes route guard (volunteer)", () => {
  test("a volunteer cannot reach the outcomes view", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/analytics?tab=outcomes");
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(page.getByRole("region", { name: "Events held" })).toHaveCount(
      0
    );
  });
});
