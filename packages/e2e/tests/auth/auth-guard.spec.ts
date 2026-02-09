import { expect, test } from "@playwright/test";

test.describe("Auth guard", () => {
  for (const route of ["/", "/users", "/reimbursements", "/advance-payments"]) {
    test(`${route} redirects to /login when unauthenticated`, async ({
      page,
    }) => {
      await page.goto(route);
      await page.waitForURL(/\/login/);
      await expect(page.getByLabel("Email")).toBeVisible();
    });
  }
});
