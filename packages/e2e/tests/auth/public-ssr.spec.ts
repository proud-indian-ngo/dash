import { expect, test } from "@playwright/test";

test.use({ javaScriptEnabled: false });

test("server-renders the login form without client JavaScript", async ({
  page,
}) => {
  const response = await page.goto("/login");
  expect(response?.status()).toBe(200);
  if (process.env.E2E_SERVER !== "dev") {
    expect(
      (await page.locator("head style").allTextContents()).join("\n")
    ).toContain("@font-face");
    await expect(page.locator('head link[rel="stylesheet"]')).toHaveCount(0);
  }

  await expect(
    page.getByRole("heading", { exact: true, name: "Log in" })
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
});

test("server-renders the registration form without client JavaScript", async ({
  page,
}) => {
  const response = await page.goto("/register");
  expect(response?.status()).toBe(200);

  await expect(
    page.getByRole("heading", { name: "Create your account" })
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Name", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Email", exact: true })
  ).toBeVisible();
  await expect(page.getByLabel(/^Password/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Register" })).toBeVisible();
});
