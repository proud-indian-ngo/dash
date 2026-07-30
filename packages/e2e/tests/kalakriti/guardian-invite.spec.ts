import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test, waitForZeroReady } from "../../fixtures/test";

const EMAIL = "kalakriti-invite-gate@pi-dash.test";
const NAME = "Registration Gate Guardian";
const PASSWORD = "RegistrationGateGuardian123!";
const YEAR = 2186;
const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-guardian-invite.ts"
);

async function fixture<T>(action: "cleanup" | "state") {
  const { stdout } = await execFileAsync("bun", ["run", helperPath, action], {
    env: process.env,
  });
  return JSON.parse(stdout.trim()) as T;
}

test("invites a new Guardian through the app and grants Edition login", async ({
  baseURL,
  browser,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Super-admin Guardian invitation flow"
  );
  test.slow();
  await fixture("cleanup");

  try {
    await page.goto(`/kalakriti/${YEAR}/guardians`);
    await waitForZeroReady(page);
    await page.getByRole("button", { name: "Invite Guardian" }).click();
    const dialog = page.getByRole("dialog", { name: "Invite Guardian" });
    await dialog.getByLabel("Name").fill(NAME);
    await dialog.getByLabel("Email").fill(EMAIL);
    await dialog.getByLabel("Initial password").fill(PASSWORD);
    await dialog.getByRole("button", { name: "Invite Guardian" }).click();
    await expect(
      page.getByText("Guardian invited", { exact: true })
    ).toBeVisible();
    await expect(page.getByText(EMAIL, { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    expect(await fixture("state")).toEqual({
      banned: false,
      externalIdentity: true,
      membershipState: "active",
      role: "external_user",
    });

    const guardianContext = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const guardianPage = await guardianContext.newPage();
    try {
      await guardianPage.goto("/login");
      await guardianPage.getByLabel("Email").fill(EMAIL);
      await guardianPage.getByLabel("Password").fill(PASSWORD);
      await guardianPage.getByRole("button", { name: "Login" }).click();
      await guardianPage.waitForURL(`/kalakriti/${YEAR}`);
      await expect(
        guardianPage.getByRole("heading", { name: `Kalakriti ${YEAR}` })
      ).toBeVisible({ timeout: 30_000 });
    } finally {
      await guardianContext.close();
    }
  } finally {
    await fixture("cleanup");
  }
});
