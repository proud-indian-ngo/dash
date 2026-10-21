import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

/**
 * The child-safeguarding gate. A version in force holds back everyone until
 * they accept it, so this spec runs in the `exclusive_last` project, after
 * every other project, with one worker, and removes the version afterwards.
 */

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/safeguarding-gate.ts"
);

async function fixture<T>(action: "cleanup" | "setup") {
  const { stdout } = await execFileAsync("bun", ["run", helperPath, action], {
    env: process.env,
  });
  return JSON.parse(stdout.trim()) as T;
}

async function acceptPolicies(page: Page) {
  await expect(page).toHaveURL(/\/accept-policies\?/);
  await expect(
    page.getByRole("button", { name: "Child-safeguarding policy" })
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "I have read and accept these policies" })
    .check();
  await page.getByRole("button", { name: "Continue" }).click();
}

async function addVolunteer(page: Page) {
  await page
    .getByRole("button", { exact: true, name: "Add volunteer" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Add volunteer" });
  await dialog.getByLabel("Search volunteers").fill("test-volunteer@");
  await page.getByRole("option", { name: /Test Volunteer/ }).click();
  await dialog.getByRole("button", { name: "Add volunteer" }).click();
}

test.describe("child-safeguarding gate (runs last, alone)", () => {
  test("a volunteer joins an event with children only after accepting the policy", async ({
    baseURL,
    browser,
    page,
  }) => {
    test.slow();
    const { eventId } = await fixture<{ eventId: string }>("setup");
    try {
      // The super admin accepts the version in force first, like everyone.
      await page.goto(`/events/${eventId}`);
      await acceptPolicies(page);
      await expect(page).toHaveURL(`/events/${eventId}`, { timeout: 20_000 });
      await waitForZeroReady(page);

      // The server refuses someone who hasn't accepted it, and says who.
      await addVolunteer(page);
      await expect(
        page.getByText(
          "Test Volunteer hasn't acknowledged the current Child-safeguarding policy, so they can't join events with children yet."
        )
      ).toBeVisible({ timeout: 20_000 });

      const volunteerContext = await browser.newContext({
        baseURL,
        storageState: path.resolve(
          import.meta.dirname,
          "../../.auth/volunteer.json"
        ),
      });
      try {
        const volunteerPage = await volunteerContext.newPage();
        await volunteerPage.goto("/events");
        await acceptPolicies(volunteerPage);
        await expect(volunteerPage).toHaveURL(/\/events$/, {
          timeout: 20_000,
        });
      } finally {
        await volunteerContext.close();
      }

      await addVolunteer(page);
      await expect(page.getByText("Volunteer added")).toBeVisible({
        timeout: 20_000,
      });
      await expect(
        page.getByRole("button", { name: "Actions for Test Volunteer" })
      ).toBeVisible();
    } finally {
      await fixture("cleanup");
    }
  });
});
