import { expect, test } from "../../fixtures/test";

/**
 * Verifies that role-gated routes redirect users without the required permission
 * back to the dashboard.
 */

async function expectRedirectToDashboard(
  page: import("@playwright/test").Page,
  url: string
) {
  await page.goto(url);
  await page.waitForURL("/", { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

/** Routes each role is redirected from, and pages it can open by heading. */
const guards: {
  role: string;
  redirected: string[];
  allowed: { heading: string; url: string }[];
}[] = [
  {
    allowed: [],
    redirected: ["/analytics", "/jobs", "/users", "/scheduled-messages"],
    role: "volunteer",
  },
  { allowed: [], redirected: ["/jobs", "/export"], role: "admin" },
  {
    allowed: [{ heading: "Vendors", url: "/vendors" }],
    redirected: ["/jobs", "/export"],
    role: "finance_admin",
  },
  {
    allowed: [{ heading: "Export data", url: "/export" }],
    redirected: [],
    role: "super_admin",
  },
  {
    allowed: [],
    redirected: [
      "/analytics",
      "/jobs",
      "/vendors",
      "/teams",
      "/scheduled-messages",
    ],
    role: "unoriented_volunteer",
  },
];

test.describe("Route guards", () => {
  for (const { allowed, redirected, role } of guards) {
    test(`${role} route access`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== role, `${role} only`);

      for (const url of redirected) {
        await test.step(`redirected from ${url}`, () =>
          expectRedirectToDashboard(page, url));
      }
      for (const { heading, url } of allowed) {
        await test.step(`can view ${url}`, async () => {
          await page.goto(url);
          await expect(page).toHaveURL(new RegExp(`${url}$`));
          await expect(
            page.getByRole("heading", { exact: true, name: heading })
          ).toBeVisible({ timeout: 10_000 });
        });
      }
    });
  }
});
