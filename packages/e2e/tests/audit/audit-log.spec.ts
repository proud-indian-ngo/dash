import { expect, test } from "../../fixtures/test";

const SEEDED_ACTION = "e2e.audit.seed";

test.describe("audit log for super admins", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin only test");
  });

  test("filters the ledger and opens immutable entry details", async ({
    page,
  }) => {
    await page.goto("/audit-log");
    await expect(
      page.getByRole("heading", { name: "Audit Log" })
    ).toBeVisible();
    await expect(page.getByText(SEEDED_ACTION).first()).toBeVisible();

    await page
      .getByPlaceholder("Search actor, action, or target...")
      .fill(SEEDED_ACTION);
    await expect(page.getByText(SEEDED_ACTION).first()).toBeVisible();

    await page.getByText(SEEDED_ACTION).first().click();
    await expect(page.getByText(/Immutable audit entry/)).toBeVisible();
    await expect(page.getByText("Safe metadata")).toBeVisible();
    await expect(page.getByText('"source": "e2e"')).toBeVisible();
  });

  test("returns filtered entries, facets, and totals from the API", async ({
    page,
    baseURL,
  }) => {
    const response = await page.request.get(
      `${baseURL}/api/audit-log?action=${SEEDED_ACTION}&outcome=success&targetType=user&offset=0&limit=20`
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: SEEDED_ACTION,
          outcome: "success",
          targetType: "user",
        }),
      ])
    );
    expect(body.facets.actions).toContain(SEEDED_ACTION);
    expect(body.facets.targetTypes).toContain("user");
  });
});

test.describe("audit log without permission", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
  });

  test("hides navigation and denies the page and API", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Audit Log" })).toBeHidden();

    await page.goto("/audit-log");
    await expect(page).toHaveURL(`${baseURL}/`);

    const response = await page.request.get(`${baseURL}/api/audit-log`);
    expect(response.status()).toBe(403);
  });
});
