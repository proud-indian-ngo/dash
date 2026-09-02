import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { KalakritiEditionPage } from "../../pages/kalakriti-edition-page";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-lifecycle.ts"
);

async function fixture<T>(
  action: "cleanup" | "invalidate_ready" | "setup",
  email?: string
) {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...(email ? [email] : [])],
    { env: process.env, killSignal: "SIGKILL", timeout: 30_000 }
  );
  return JSON.parse(stdout.trim()) as T;
}

test("enforces registration readiness, lifecycle locks, and structural cloning", async ({
  page,
  superAdminEmail,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Super-admin lifecycle flow"
  );
  test.slow();
  let years: {
    cloneTargetYear: number;
    readyYear: number;
    sourceYear: number;
  };
  try {
    years = await fixture("setup", superAdminEmail);
    await page.goto(`/kalakriti/${years.cloneTargetYear}`);
    await waitForZeroReady(page);
    await expect(
      page.getByText("At least one active Center is required")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open registration" })
    ).toBeDisabled();

    await new KalakritiEditionPage(page).chooseAdminAction(
      "Clone configuration"
    );
    const sourceDialog = page.getByRole("dialog", {
      name: "Clone Edition configuration",
    });
    await sourceDialog.getByLabel("Source Edition").click();
    await page
      .getByRole("option", {
        name: `Kalakriti ${years.sourceYear} (${years.sourceYear})`,
      })
      .click();
    await sourceDialog.getByRole("button", { name: "Review clone" }).click();
    const cloneDialog = page.getByRole("alertdialog", {
      name: "Clone this configuration?",
    });
    await cloneDialog
      .getByRole("button", { name: "Clone configuration" })
      .click();
    await expect(
      page.getByText("Edition configuration cloned", { exact: true })
    ).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    await page.goto(`/kalakriti/${years.cloneTargetYear}/eligibility`);
    await expect(
      page.getByText("Source Junior", { exact: true })
    ).toBeVisible();
    await page.goto(
      `/kalakriti/${years.cloneTargetYear}/competitions/categories`
    );
    await expect(page.getByText("Source Arts", { exact: true })).toBeVisible();
    await page.goto(`/kalakriti/${years.cloneTargetYear}/competitions/catalog`);
    await expect(page.getByText("Source Dance", { exact: true })).toBeVisible();
    await page.goto(`/kalakriti/${years.cloneTargetYear}/competitions/venues`);
    await expect(page.getByText("Source Stage", { exact: true })).toBeVisible();
    await page.goto(
      `/kalakriti/${years.cloneTargetYear}/competitions/schedule`
    );
    await expect(
      page.getByText("No Competition Sessions scheduled.")
    ).toBeVisible();
    await page.goto(`/kalakriti/${years.cloneTargetYear}/centers`);
    await expect(page.getByText("No Centers available")).toBeVisible();

    await page.goto(`/kalakriti/${years.readyYear}`);
    await waitForZeroReady(page);
    await page.getByRole("button", { name: "Open registration" }).click();
    const openDialog = page.getByRole("alertdialog", {
      name: "Open registration?",
    });
    await openDialog.getByRole("button", { name: "Open registration" }).click();
    await expect(
      page.getByText("Registration opened", { exact: true })
    ).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Lock registration" }).click();
    const lockDialog = page.getByRole("alertdialog", {
      name: "Lock registration?",
    });
    await lockDialog.getByRole("button", { name: "Lock registration" }).click();
    await expect(
      page.getByText("Registration locked", { exact: true })
    ).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    await page.goto(`/kalakriti/${years.readyYear}/competitions/catalog`);
    await expect(
      page.getByRole("button", { name: "Add Competition" })
    ).toHaveCount(0);
    await page.goto(`/kalakriti/${years.readyYear}/competitions/schedule`);
    await page.getByText("Solo Dance", { exact: true }).click();
    await page.getByRole("button", { name: "Edit Session" }).click();
    const sessionDialog = page.getByRole("dialog", {
      name: "Edit Competition Session",
    });
    await expect(
      sessionDialog.getByLabel("Competition Division")
    ).toBeDisabled();
    await expect(sessionDialog.getByLabel("Venue")).toBeEnabled();
    await sessionDialog.getByRole("button", { name: "Cancel" }).click();

    await page.goto(`/kalakriti/${years.readyYear}`);
    await page.getByRole("button", { name: "Open registration" }).click();
    const reopenDialog = page.getByRole("alertdialog", {
      name: "Open registration?",
    });
    await reopenDialog
      .getByRole("button", { name: "Open registration" })
      .click();
    await expect(
      page.getByText("Registration opened", { exact: true })
    ).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Lock registration" }).click();
    await page
      .getByRole("alertdialog", { name: "Lock registration?" })
      .getByRole("button", { name: "Lock registration" })
      .click();
    await expect(
      page.getByText("Registration locked", { exact: true })
    ).toBeVisible();
    await fixture("invalidate_ready");
    await page.reload();
    await waitForZeroReady(page);
    await expect(
      page.getByText("Every Age Category needs a Student limit")
    ).toBeVisible();
    await expect(
      page.getByText("Complete these before reopening registration")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open registration" })
    ).toBeDisabled();
  } finally {
    await page.goto("about:blank");
    await fixture("cleanup");
  }
});
