import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { openSettingsPage } from "../../helpers/settings";

test.describe("Settings page", () => {
  test("opens from the account menu on Profile", async ({
    page,
    request,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Role-independent");
    await page.goto("/");
    await waitForZeroReady(page);

    const sidebar = page.locator("[data-sidebar='sidebar']");
    if (!(await sidebar.isVisible())) {
      await page
        .getByRole("navigation", { name: "Main" })
        .getByRole("button", { name: "Menu" })
        .click();
    }
    await page.getByRole("button", { name: "Account menu" }).click();
    if ((page.viewportSize()?.width ?? 1280) < 768) {
      await page
        .getByRole("dialog", { name: "Account actions" })
        .getByRole("button", { exact: true, name: "Settings" })
        .click();
    } else {
      await page.getByRole("menuitem", { name: "Settings" }).click();
    }

    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Profile" })
    ).toBeVisible();

    await test.step("profile images validate stored bytes and resist PUT replay", async () => {
      test.slow();
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
        "base64"
      );
      const choose = async (buffer: Buffer) => {
        const chooser = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "Change photo" }).click();
        await (
          await chooser
        ).setFiles({ name: "avatar.png", mimeType: "image/png", buffer });
      };
      const session = async () =>
        (await (await request.get(`${baseURL}/api/auth/get-session`)).json())
          .user as { id: string; image: string | null };
      const original = await session();
      const endpoint = process.env.R2_ENDPOINT;
      expect(endpoint).toBeTruthy();
      const r2Pattern = `${endpoint}/**`;
      let signedPut = "";
      let oversized = true;
      await page.route(r2Pattern, async (route) => {
        if (route.request().method() !== "PUT") {
          await route.continue();
          return;
        }
        signedPut = route.request().url();
        await route.continue(
          oversized ? { postData: Buffer.alloc(5 * 1024 * 1024 + 1) } : {}
        );
      });
      await choose(png);
      await expect(
        page.getByText("Couldn't upload profile picture", { exact: true })
      ).toBeVisible();
      expect((await session()).image).toBe(original.image);
      oversized = false;
      await choose(Buffer.from("<svg onload=alert(1)></svg>"));
      await expect(
        page.getByRole("button", { name: "Change photo" })
      ).toBeEnabled();
      expect((await session()).image).toBe(original.image);
      await choose(png);
      await expect(
        page.getByText("Looking good!", { exact: true })
      ).toBeVisible();
      const saved = await session();
      expect(saved.image).toContain(encodeURIComponent("/validated/"));
      expect(signedPut).toContain("/tmp/");
      const replay = await request.put(signedPut, {
        data: "<html>replacement</html>",
        headers: { "Content-Type": "text/html" },
      });
      expect(replay.ok()).toBe(true);
      const read = await request.get(`${baseURL}${saved.image}`, {
        maxRedirects: 0,
      });
      expect(read.status()).toBe(302);
      const location = read.headers().location;
      expect(location).toBeTruthy();
      const stored = await request.get(location!);
      expect(await stored.body()).toEqual(png);
      const forged = await request.post(`${baseURL}/api/auth/update-user`, {
        headers: { Origin: baseURL! },
        data: {
          image: `/api/media/avatar/${saved.id}?key=${encodeURIComponent(`${process.env.R2_KEY_PREFIX ?? "attachments"}/avatars/tmp/${saved.id}/forged.png`)}`,
        },
      });
      expect(forged.status()).toBe(400);
      expect((await session()).image).toBe(saved.image);
      await page.getByRole("button", { name: "Remove", exact: true }).click();
      await expect(
        page.getByText("Profile picture removed", { exact: true })
      ).toBeVisible();
      expect((await session()).image).toBe("");
      await page.unroute(r2Pattern);
      await testInfo.attach("avatar-publication.json", {
        body: JSON.stringify({
          oversizedRejected: true,
          spoofedTypeRejected: true,
          replayPreservedPublishedBytes: true,
          alternateUpdateRejected: true,
          removed: true,
        }),
        contentType: "application/json",
      });
    });
  });

  test("/settings goes to Profile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Role-independent");
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings\/profile$/);
  });

  test("the nav moves between sections", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Role-independent");
    await openSettingsPage(page, "/settings/profile", "Profile");
    const nav = page.getByRole("navigation", { name: "Settings" });

    await nav.getByRole("link", { exact: true, name: "Account" }).click();
    await expect(page).toHaveURL(/\/settings\/account$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Account" })
    ).toBeVisible();

    await nav.getByRole("link", { name: "Notifications" }).click();
    await expect(
      page.getByText("Choose what reaches you, and where.")
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: /in-app/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    await nav.getByRole("link", { name: "Bank accounts" }).click();
    await expect(
      page.getByRole("heading", { name: "Add a bank account" })
    ).toBeVisible();
  });

  test("admins see the Organization sections", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    await openSettingsPage(page, "/settings/profile", "Profile");
    const nav = page.getByRole("navigation", { name: "Settings" });

    for (const label of [
      "General",
      "Roles",
      "Expense categories",
      "WhatsApp groups",
      "API tokens",
      "Maintenance",
    ]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
  });

  test("volunteers see only their own sections", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await openSettingsPage(page, "/settings/profile", "Profile");
    const nav = page.getByRole("navigation", { name: "Settings" });

    await expect(nav.getByRole("link", { name: "Profile" })).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Expense categories" })
    ).toBeHidden();
    await expect(
      nav.getByRole("link", { name: "WhatsApp groups" })
    ).toBeHidden();
  });

  test("volunteers are sent away from Organization pages", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await page.goto("/settings/expense-categories");
    await expect(page).not.toHaveURL(/expense-categories/);
  });
});
