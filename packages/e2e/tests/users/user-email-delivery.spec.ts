import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { ListPage } from "../../pages/list-page";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/email-delivery.ts"
);

async function fixture(...args: string[]) {
  await execFileAsync("bun", ["run", helperPath, ...args], {
    env: process.env,
  });
}

function bouncedEmail(): string {
  const email = process.env.KALAKRITI_UNRELATED_VOLUNTEER_EMAIL;
  if (!email) {
    throw new Error("KALAKRITI_UNRELATED_VOLUNTEER_EMAIL is not set");
  }
  return email;
}

test.describe("User email delivery (admin)", () => {
  test.afterAll(async () => {
    await fixture("clear", bouncedEmail());
  });

  test("shows a bouncing address on the user sheet and resumes email", async ({
    page,
  }) => {
    const email = bouncedEmail();
    await fixture("suppress", email);

    const list = new ListPage(page);
    await page.goto("/users");
    await waitForZeroReady(page);
    await list.waitForTableData(30_000);
    await page.getByPlaceholder("Search users...").fill(email);
    const row = list.getTable().getByRole("row").filter({ hasText: email });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole("cell").first().click();

    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Email delivery")).toBeVisible();
    await expect(sheet.getByText("Email bouncing")).toBeVisible();

    await sheet.getByRole("button", { name: "Resume email" }).click();
    await expect(page.getByText("Email resumed")).toBeVisible();
    await expect(sheet.getByText("Email delivery")).toHaveCount(0);
  });
});
