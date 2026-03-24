import { errors, expect, type Locator, type Page } from "@playwright/test";

const { TimeoutError } = errors;

export class ListPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  getTable(): Locator {
    return this.page.getByRole("table");
  }

  getRows(): Locator {
    return this.getTable().getByRole("row");
  }

  getColumnHeaders(): Locator {
    return this.getRows().first().getByRole("columnheader");
  }

  getStatsCards(): Locator {
    return this.page.locator("[data-slot='card-title']");
  }

  getColumnsButton(): Locator {
    return this.page.getByRole("button", { name: "Columns" });
  }

  getNewRequestButton(): Locator {
    return this.page.getByRole("button", { name: "Add request" });
  }

  getSearchInput(placeholder: string): Locator {
    return this.page.getByPlaceholder(placeholder);
  }

  async waitForTableData(timeout = 15_000): Promise<void> {
    const table = this.getTable();
    await table.waitFor({ state: "visible" });
    // Wait for at least one data row (more than just the header)
    await expect(table.getByRole("row")).not.toHaveCount(1, { timeout });
  }

  getRowByText(text: string): Locator {
    return this.getTable().getByRole("row").filter({ hasText: text });
  }

  getPendingRow(): Locator {
    return this.getTable()
      .getByRole("row")
      .filter({ hasText: /pending/i })
      .first();
  }

  async openRowActionMenu(
    row: Locator,
    expectMenuItem = "View"
  ): Promise<void> {
    const trigger = row.getByTestId("row-actions");
    const viewItem = this.page.getByRole("menuitem", {
      name: expectMenuItem,
    });

    for (let attempt = 0; attempt < 3; attempt++) {
      await trigger.click();
      try {
        await expect(viewItem).toBeVisible({ timeout: 3000 });
        return;
      } catch {
        // Menu didn't open — retry click
      }
    }
    await trigger.click();
    await expect(viewItem).toBeVisible();
  }

  async clickMenuItem(name: string): Promise<void> {
    await this.page.getByRole("menuitem", { name }).click();
  }

  /**
   * Opens the row action menu and clicks a menu item in one atomic sequence.
   * This avoids the race condition where the dropdown closes between
   * openRowActionMenu() and clickMenuItem() due to re-renders.
   */
  async openRowActionAndClick(
    row: Locator,
    menuItemName: string
  ): Promise<void> {
    const trigger = row.getByTestId("row-actions");
    const menuItem = this.page.getByRole("menuitem", { name: menuItemName });

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await trigger.click({ timeout: 5000 });
        await menuItem.click({ timeout: 3000 });
        return;
      } catch (error) {
        if (this.page.isClosed()) {
          throw new Error("Page closed during retry");
        }
        // Only retry on timeout errors (menu didn't open or item not clickable).
        // Re-throw real failures (element detached, page navigated) immediately.
        if (!(error instanceof TimeoutError)) {
          throw error;
        }
        // Dismiss any partially opened menu before retrying
        await this.page.keyboard.press("Escape").catch(() => {
          // Ignore — page may have navigated
        });
        // Brief pause to let Zero sync settle
        await this.page.waitForTimeout(500);
      }
    }
    // Final attempt — let it fail with a clear error
    await trigger.click();
    await menuItem.click();
  }
}
