import { expect, test } from "@playwright/test";

test.use({ javaScriptEnabled: false });

test("server-renders the login form without client JavaScript", async ({
  page,
}) => {
  const response = await page.goto("/login");
  expect(response?.status()).toBe(200);

  await expect(
    page.getByRole("heading", { exact: true, name: "Log in" })
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
});
