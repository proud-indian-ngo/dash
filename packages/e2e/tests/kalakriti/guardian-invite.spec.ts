import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { KalakritiGuardiansPage } from "../../pages/kalakriti-guardians-page";

const EMAIL = "kalakriti-invite-gate@pi-dash.test";
const EDITED_EMAIL = "kalakriti-invite-gate-edited@pi-dash.test";
const NAME = "Registration Gate Guardian";
const EDITED_NAME = "Registration Gate Guardian Edited";
const EDITED_PHONE = "+919900218611";
const PASSWORD = "RegistrationGateGuardian123!";
const YEAR = 2186;
const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-guardian-invite.ts"
);

interface GuardianInviteState {
  banned: boolean | null;
  email: string;
  externalIdentity: boolean;
  membershipEmail: string | null;
  membershipName: string | null;
  membershipState: "active" | "archived" | null;
  role: string;
}

async function fixture<T>(action: "cleanup" | "state") {
  const { stdout } = await execFileAsync("bun", ["run", helperPath, action], {
    env: process.env,
  });
  return JSON.parse(stdout.trim()) as T;
}

test("invites a new Guardian, edits contact details, and grants Edition login", async ({
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
  const guardians = new KalakritiGuardiansPage(page);

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

    expect(await fixture<GuardianInviteState>("state")).toEqual({
      banned: false,
      email: EMAIL,
      externalIdentity: true,
      membershipEmail: EMAIL,
      membershipName: NAME,
      membershipState: "active",
      role: "external_user",
    });

    await guardians.editDetails({
      currentName: NAME,
      email: EDITED_EMAIL,
      name: EDITED_NAME,
      phone: EDITED_PHONE,
    });
    await expect(
      page.getByText("Guardian details updated", { exact: true })
    ).toBeVisible();
    await expect(page.getByText(EDITED_NAME, { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(EDITED_EMAIL, { exact: true })).toBeVisible();
    await expect(page.getByText(EDITED_PHONE, { exact: true })).toBeVisible();

    expect(await fixture<GuardianInviteState>("state")).toEqual({
      banned: false,
      email: EDITED_EMAIL,
      externalIdentity: true,
      membershipEmail: EDITED_EMAIL,
      membershipName: EDITED_NAME,
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
      await guardianPage.getByLabel("Email").fill(EDITED_EMAIL);
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
    await page.goto("about:blank");
    await fixture("cleanup");
  }
});
