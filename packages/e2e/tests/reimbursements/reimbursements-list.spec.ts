import { expect, test } from "../../fixtures/test";
import { applyQuickFilter } from "../../helpers/quick-filters";
import { ReimbursementPage } from "../../pages/reimbursement-page";

test.describe("Reimbursements list", () => {
  let reimbursements: ReimbursementPage;

  test.beforeEach(async ({ page }) => {
    reimbursements = new ReimbursementPage(page, "reimbursement");
    await reimbursements.navigateToList();
  });

  test("renders table with expected columns", async ({ page }) => {
    const emptyState = page.getByText("No reimbursements found.");
    const headers = reimbursements.list.getColumnHeaders();
    const titleHeader = headers.filter({ hasText: /Title/ });
    await expect(titleHeader.or(emptyState)).toBeVisible();
    if (await emptyState.isVisible()) {
      return;
    }
    await expect(headers.filter({ hasText: /Type/ })).toBeVisible();
    await expect(headers.filter({ hasText: /Status/ })).toBeVisible();
    await expect(headers.filter({ hasText: /Total/ })).toBeVisible();
    await expect(headers.filter({ hasText: /Submitted/ })).toBeVisible();
  });

  test("search box is present", async () => {
    await expect(
      reimbursements.list.getSearchInput("Search reimbursements...")
    ).toBeVisible();
  });

  test("New reimbursement button navigates to /reimbursements/new", async ({
    page,
  }) => {
    await reimbursements.list.getNewReimbursementButton().click();
    await page.waitForURL(/\/reimbursements\/new/);
    await expect(
      page.getByRole("heading", { name: "New reimbursement" })
    ).toBeVisible();
  });

  test("columns dropdown toggles column visibility", async ({ page }) => {
    await reimbursements.list.getColumnsButton().click();
    await expect(
      page.getByRole("menuitemcheckbox", { name: "Title" })
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("hiding Title preserves the claim row intent target", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Requires the seeded reimbursement"
    );
    await reimbursements.list
      .getSearchInput("Search reimbursements...")
      .fill("E2E Seed Reimbursement");
    const row = reimbursements.list
      .getTable()
      .getByRole("row")
      .filter({ hasText: "E2E Seed Reimbursement" });
    const actions = row.getByRole("button", { name: "Row actions" });
    await expect(actions).toBeVisible();
    const requestId = await row
      .locator("[data-reimbursement-intent-id]")
      .getAttribute("data-reimbursement-intent-id");
    expect(requestId).toBeTruthy();

    await reimbursements.list.getColumnsButton().click();
    await page.getByRole("menuitemcheckbox", { name: "Title" }).click();
    await page.keyboard.press("Escape");
    await expect(
      reimbursements.list.getTable().getByText("E2E Seed Reimbursement")
    ).toHaveCount(0);
    const hiddenTitleRow = reimbursements.list
      .getTable()
      .getByRole("row")
      .filter({
        has: page.locator(`[data-reimbursement-intent-id="${requestId}"]`),
      });
    await expect(
      hiddenTitleRow.getByRole("button", { name: "Row actions" })
    ).toBeVisible();
    await hiddenTitleRow.hover();
    await hiddenTitleRow.focus();
    await expect(hiddenTitleRow).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`/reimbursements/${requestId}`);
    await expect(
      page.getByRole("heading", { name: "E2E Seed Reimbursement", exact: true })
    ).toBeVisible();
  });

  test("table footer is present", async ({ page }) => {
    await expect(
      page.getByText("Rows per page").or(page.getByText("0 of 0 results"))
    ).toBeVisible();
  });

  test("advanced filters open their editor and return to quick filters", async ({
    page,
  }) => {
    await page.getByRole("button", { exact: true, name: "More" }).click();
    await page.getByRole("menuitem", { name: "Advanced filters" }).click();
    await page.getByRole("button", { exact: true, name: "Add filter" }).click();
    await expect(page.getByPlaceholder("Search attributes...")).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { exact: true, name: "Quick filters" })
      .click();
    await expect(
      page.getByRole("button", { exact: true, name: "More" })
    ).toBeVisible();
  });

  for (const viewport of ["desktop", "mobile"] as const) {
    test(`date filter applies a custom range and a preset on ${viewport}`, async ({
      page,
    }) => {
      if (viewport === "mobile") {
        await page.setViewportSize({ width: 390, height: 844 });
        await page
          .getByRole("button", { exact: true, name: "Filters" })
          .click();
        await page.getByRole("button", { name: "Submitted Any" }).click();
      } else {
        await page.getByRole("button", { exact: true, name: "More" }).click();
        await page
          .getByRole("menuitem", { exact: true, name: "Submitted" })
          .click();
      }
      await page.getByRole("radio", { name: "Custom range" }).click();
      const days = page.getByRole("grid").getByRole("button");
      // Both positions are in the current month, beyond its leading spillover days.
      await days.nth(10).click();
      await days.nth(13).click();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("filters"))
        .toContain('"operator":"between"');
      await page.getByRole("button", { exact: true, name: "Presets" }).click();
      const preset = page.getByRole("radio", { name: "Last 7 days" });
      await preset.click();
      await expect(preset).toHaveAttribute("aria-checked", "true");
      await expect
        .poll(() => new URL(page.url()).searchParams.get("filters"))
        .toContain("submittedAt");
    });
  }

  test("a saved complex filter loads its controls and can be cleared", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only seed rows");
    const filters = {
      combinator: "and",
      id: "saved-filter",
      rules: [
        {
          id: "pending",
          operator: "is",
          path: ["status"],
          type: "rule",
          value: "pending",
        },
        {
          id: "not-approved",
          operator: "is_not",
          path: ["status"],
          type: "rule",
          value: "approved",
        },
      ],
      type: "group",
    };
    await page.goto(
      `/reimbursements?size=1&filters=${encodeURIComponent(JSON.stringify(filters))}`
    );
    const table = reimbursements.list.getTable();
    const search = reimbursements.list.getSearchInput(
      "Search reimbursements..."
    );
    await search.fill("E2E Seed Reimbursement");
    await expect(table.getByText("E2E Seed Reimbursement")).toBeVisible();
    await search.fill("E2E Upcoming Event Reimbursement");
    await expect(page.getByText("No reimbursements found.")).toBeVisible();
    await expect(
      page.getByRole("button", { exact: true, name: "Add filter" })
    ).toBeVisible();
    await page.getByRole("button", { exact: true, name: "Clear" }).click();
    await expect(
      table.getByText("E2E Upcoming Event Reimbursement")
    ).toBeVisible();
  });

  test("shows stats cards", async () => {
    const cards = reimbursements.list.getStatsCards();
    await expect(cards.getByText("Total")).toBeVisible({ timeout: 15_000 });
    await expect(cards.getByText("Pending")).toBeVisible();
    await expect(cards.getByText("Approved")).toBeVisible();
    await expect(cards.getByText("Rejected")).toBeVisible();
  });

  test("status filter hides non-matching rows and clear restores them", async ({
    page,
  }, testInfo) => {
    test.skip(
      !["super_admin", "admin", "finance_admin"].includes(
        testInfo.project.name
      ),
      "Seed reimbursements are only visible to view-all roles"
    );
    await reimbursements.list.waitForTableData();
    const table = reimbursements.list.getTable();
    const hasSeedRows =
      (await table.getByText("E2E Seed Reimbursement").count()) > 0;
    test.skip(
      !hasSeedRows,
      "Seed reimbursements are not on the first page (later tests created newer rows)"
    );
    await expect(table.getByText("E2E Seed Reimbursement")).toBeVisible();
    await expect(
      table.getByText("E2E Upcoming Event Reimbursement")
    ).toBeVisible();

    await page.getByRole("tab", { name: /^Pending/ }).click();

    await expect(table.getByText("E2E Seed Reimbursement")).toBeVisible();
    await expect(
      table.getByText("E2E Upcoming Event Reimbursement")
    ).toHaveCount(0);

    await page.getByRole("tab", { name: /^All/ }).click();
    await expect(
      table.getByText("E2E Upcoming Event Reimbursement")
    ).toBeVisible();
  });

  test("event filter hides non-matching rows and clear restores them", async ({
    page,
  }, testInfo) => {
    test.skip(
      !["super_admin", "admin", "finance_admin"].includes(
        testInfo.project.name
      ),
      "Seed reimbursements are only visible to view-all roles"
    );
    await reimbursements.list.waitForTableData();
    const table = reimbursements.list.getTable();
    await applyQuickFilter(page, "Event", "E2E Upcoming Public Bangalore");

    await expect(
      table.getByText("E2E Upcoming Event Reimbursement")
    ).toBeVisible();
    await expect(table.getByText("E2E Seed Reimbursement")).toHaveCount(0);

    await page.getByRole("button", { name: "Clear" }).click();
    // Parallel tests add newer rows, so search rather than assume page one.
    await page
      .getByPlaceholder("Search reimbursements...")
      .fill("E2E Seed Reimbursement");
    await expect(table.getByText("E2E Seed Reimbursement")).toBeVisible();
  });
});
