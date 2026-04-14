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
  // Log auth API responses for CI debugging
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/api/auth/")) {
      console.log(`[auth] ${res.status()} ${res.request().method()} ${url}`);
    }
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL("/");
}

setup("authenticate as admin", async ({ page }) => {
  await authenticate(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.context().storageState({ path: adminAuthFile });
});

setup("authenticate as volunteer", async ({ page }) => {
  await authenticate(page, VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD);
  await page.context().storageState({ path: volunteerAuthFile });
});
