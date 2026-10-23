import type { Locator, Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { ListPage } from "../../pages/list-page";

test.describe("User row actions (admin)", () => {
  test.describe.configure({ mode: "serial" });

  let list: ListPage;

  test.beforeEach(async ({ page }) => {
    list = new ListPage(page);
    await page.goto("/users");
    await waitForZeroReady(page);
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
    await findVolunteerRow(page);
  });

  async function findVolunteerRow(page: Page) {
    const searchBox = page.getByPlaceholder("Search users...");
    async function tryFind(attempt: number): Promise<void> {
      await searchBox.fill("");
      await list.waitForTableData(30_000);
      await searchBox.fill("test-volunteer");
      const row = getVolunteerRow();
      if (await row.isVisible({ timeout: 15_000 }).catch(() => false)) {
        return;
      }
      await page.reload();
      await waitForZeroReady(page);
      if (attempt < 2) {
        await tryFind(attempt + 1);
      }
    }

    await tryFind(0);
    await searchBox.fill("test-volunteer");
    await expect(getVolunteerRow()).toBeVisible({ timeout: 30_000 });
  }

  function getVolunteerRow() {
    return list
      .getTable()
      .getByRole("row")
      .filter({ hasText: "test-volunteer@pi-dash.test" });
  }

  async function openVolunteerActionAndWaitFor(
    page: Page,
    action: string,
    target: Locator
  ): Promise<void> {
    const tryOpen = async (attempt: number): Promise<void> => {
      try {
        await list.openRowActionAndClick(getVolunteerRow(), action);
      } catch (error) {
        if (attempt >= 2) {
          throw error;
        }
        await page.keyboard.press("Escape").catch(() => {
          // Ignore stale overlays between retries.
        });
        await page.waitForTimeout(500);
        await tryOpen(attempt + 1);
        return;
      }
      if (await target.isVisible({ timeout: 3000 }).catch(() => false)) {
        return;
      }
      await page.keyboard.press("Escape").catch(() => {
        // Ignore stale overlays between retries.
      });
      if (attempt >= 2) {
        await expect(target).toBeVisible({ timeout: 10_000 });
        return;
      }
      await tryOpen(attempt + 1);
    };

    await tryOpen(0);
  }

  test("row action menu shows Edit, Reset password, Ban user, Delete and emails the user", async ({
    page,
    volunteerEmail,
  }) => {
    await expect(async () => {
      await page.keyboard.press("Escape");
      await list.openRowActionMenu(getVolunteerRow(), "Edit");
      for (const name of ["Edit", "Reset password", "Ban user", "Delete"]) {
        await expect(
          page.getByRole("menuitem", { name, exact: true })
        ).toBeVisible({
          timeout: 1000,
        });
      }
      await expect(
        page.getByRole("menuitem", { name: `Email ${volunteerEmail}` })
      ).toHaveAttribute("href", `mailto:${volunteerEmail}`, { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
  });

  test("Cancel closes each row action dialog", async ({ page }) => {
    for (const [action, role] of [
      ["Edit", "dialog"],
      ["Delete", "alertdialog"],
      ["Ban user", "dialog"],
      ["Reset password", "dialog"],
    ] as const) {
      await test.step(action, async () => {
        const dialog = page.getByRole(role);
        await openVolunteerActionAndWaitFor(page, action, dialog);
        await dialog.getByRole("button", { name: "Cancel" }).click();
        await expect(dialog).toBeHidden();
      });
    }
  });

  test("Notifications shows only supported Kalakriti channels", async ({
    page,
  }) => {
    const dialog = page.getByRole("dialog");
    await openVolunteerActionAndWaitFor(page, "Notifications", dialog);

    await expect(
      dialog.getByRole("checkbox", { name: "Kalakriti Registration in-app" })
    ).toBeVisible();
    await expect(
      dialog.getByRole("checkbox", { name: "Kalakriti Registration WhatsApp" })
    ).toBeVisible();
    await expect(
      dialog.getByRole("checkbox", { name: "Kalakriti Registration email" })
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("checkbox", { name: "Kalakriti Schedule email" })
    ).toHaveCount(0);
  });
});
