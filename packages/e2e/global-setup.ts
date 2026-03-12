import path from "node:path";
import { test as setup } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(import.meta.dirname, ".env.test"),
  quiet: true,
});

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!;
const VOLUNTEER_EMAIL = process.env.VOLUNTEER_EMAIL!;
const VOLUNTEER_PASSWORD = process.env.VOLUNTEER_PASSWORD!;

const adminAuthFile = path.resolve(import.meta.dirname, ".auth/admin.json");
const volunteerAuthFile = path.resolve(
  import.meta.dirname,
  ".auth/volunteer.json"
);

async function authenticate(
  page: import("@playwright/test").Page,
  email: string,
  password: string
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL("/");
}

async function waitForZeroSync(
  page: import("@playwright/test").Page,
  url: string,
  locator: import("@playwright/test").Locator,
  label: string
) {
  await page.goto(url);
  await locator.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {
    throw new Error(
      `Zero sync timed out waiting for "${label}" on ${url} (30s)`
    );
  });
}

setup("authenticate as admin", async ({ page }) => {
  await authenticate(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await waitForZeroSync(
    page,
    "/users",
    page.getByText("test-volunteer@pi-dash.test"),
    "admin: user table synced"
  );
  await page.context().storageState({ path: adminAuthFile });
});

setup("authenticate as volunteer", async ({ page }) => {
  await authenticate(page, VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD);
  await waitForZeroSync(
    page,
    "/reimbursements",
    page.getByText("Rows per page"),
    "volunteer: Zero query resolved"
  );
  await page.context().storageState({ path: volunteerAuthFile });
});
