import { expect, test } from "../../fixtures/test";
import { ListPage } from "../../pages/list-page";

test.describe("Users navigation cache", () => {
  test("shows cached users while the return visit refreshes", async ({
    financeAdminEmail,
    page,
  }) => {
    let roleOptionsServerFnPath: string | undefined;
    let usersServerFnPath: string | undefined;
    page.on("response", async (response) => {
      const url = new URL(response.url());
      if (!url.pathname.startsWith("/_serverFn/")) {
        return;
      }
      const body = await response.text().catch(() => "");
      if (body.includes(financeAdminEmail)) {
        usersServerFnPath = url.pathname;
      } else if (
        body.includes("finance_admin") &&
        body.includes("Finance Admin")
      ) {
        roleOptionsServerFnPath = url.pathname;
      }
    });

    await page.goto("/users");
    await expect(
      page.getByRole("heading", { exact: true, name: "Users" })
    ).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder("Search users...").fill(financeAdminEmail);
    await expect(page.getByText(financeAdminEmail)).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(() => usersServerFnPath).toBeTruthy();
    await expect.poll(() => roleOptionsServerFnPath).toBeTruthy();

    const heldPaths = new Set(
      [usersServerFnPath, roleOptionsServerFnPath].filter(
        (path): path is string => path !== undefined
      )
    );
    expect(heldPaths.size).toBe(2);

    const sidebar = page.locator('[data-sidebar="content"]');
    await sidebar.getByRole("link", { exact: true, name: "Dashboard" }).click();
    await expect(
      page.getByRole("heading", { exact: true, name: "Dashboard" })
    ).toBeVisible();

    const refreshGate = Promise.withResolvers<void>();
    const refreshRequests = new Set<string>();
    await page.route("**/_serverFn/**", async (route) => {
      const requestPath = new URL(route.request().url()).pathname;
      if (heldPaths.has(requestPath)) {
        refreshRequests.add(requestPath);
        await refreshGate.promise;
      }
      await route.continue();
    });

    try {
      await sidebar.getByRole("link", { exact: true, name: "Users" }).click();
      await expect(
        page.getByRole("heading", { exact: true, name: "Users" })
      ).toBeVisible();
      await expect.poll(() => refreshRequests.size).toBe(2);

      const search = page.getByPlaceholder("Search users...");
      await expect(search).toBeVisible();
      await search.fill(financeAdminEmail);
      await expect(page.getByText(financeAdminEmail)).toBeVisible();
      await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);

      const list = new ListPage(page);
      await list.openRowActionAndClick(
        list.getRowByText(financeAdminEmail),
        "Edit"
      );
      const dialog = page.getByRole("dialog", {
        name: "Edit Test Finance Admin",
      });
      await expect(
        dialog.getByRole("combobox", { name: "Role" })
      ).toContainText("Finance Admin");
      await dialog.getByRole("button", { name: "Cancel" }).click();

      const refreshed = Promise.all(
        [...heldPaths].map((path) =>
          page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === path &&
              response.request().method() === "GET"
          )
        )
      );
      refreshGate.resolve();
      for (const response of await refreshed) {
        expect(response.ok()).toBe(true);
      }

      await expect(page.getByText(financeAdminEmail)).toBeVisible();
    } finally {
      refreshGate.resolve();
      await page.unroute("**/_serverFn/**");
    }
  });
});
