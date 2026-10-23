import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/reimbursement-stats.ts"
);

test("reimbursement stats count and total each status, leaving voided requests out", async ({
  baseURL,
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Signs in as its own volunteer, so one project runs it"
  );
  const { stdout } = await execFileAsync("bun", ["run", helperPath, "setup"], {
    env: process.env,
  });
  const statsUser = JSON.parse(stdout.trim()) as {
    email: string;
    password: string;
  };

  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  try {
    const signIn = await context.request.post("/api/auth/sign-in/email", {
      data: statsUser,
      // Its own address, so the sign-in rate limit never sees other specs.
      headers: { "x-forwarded-for": "192.0.2.218" },
    });
    expect(signIn.ok()).toBe(true);
    const page = await context.newPage();
    await page.goto("/reimbursements");
    await waitForZeroReady(page);

    const chip = (label: string) =>
      page
        .locator("[data-slot='stat-chip']")
        .filter({ has: page.getByText(label, { exact: true }) });
    // Count, then the money total: a voided ₹5,000.00 request is in neither.
    await expect(chip("Total")).toHaveText("Total4₹1,594.56");
    await expect(chip("Pending")).toHaveText("Pending2₹350.00");
    await expect(chip("Approved")).toHaveText("Approved1₹1,234.56");
    await expect(chip("Rejected")).toHaveText("Rejected1₹10.00");
  } finally {
    await context.close();
  }
});
