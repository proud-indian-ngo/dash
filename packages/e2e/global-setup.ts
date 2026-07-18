import path from "node:path";
import { test as setup } from "@playwright/test";
import dotenv from "dotenv";
import { KALAKRITI_ACTORS } from "./fixtures/kalakriti-actors";

dotenv.config({
  path: path.resolve(import.meta.dirname, ".env.test"),
  quiet: true,
});

setup.describe.configure({ mode: "serial" });

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL!;
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD!;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!;
const FINANCE_ADMIN_EMAIL = process.env.FINANCE_ADMIN_EMAIL!;
const FINANCE_ADMIN_PASSWORD = process.env.FINANCE_ADMIN_PASSWORD!;
const VOLUNTEER_EMAIL = process.env.VOLUNTEER_EMAIL!;
const VOLUNTEER_PASSWORD = process.env.VOLUNTEER_PASSWORD!;
const UNORIENTED_VOLUNTEER_EMAIL = process.env.UNORIENTED_VOLUNTEER_EMAIL!;
const UNORIENTED_VOLUNTEER_PASSWORD =
  process.env.UNORIENTED_VOLUNTEER_PASSWORD!;

const superAdminAuthFile = path.resolve(
  import.meta.dirname,
  ".auth/super_admin.json"
);
const adminAuthFile = path.resolve(import.meta.dirname, ".auth/admin.json");
const financeAdminAuthFile = path.resolve(
  import.meta.dirname,
  ".auth/finance_admin.json"
);
const volunteerAuthFile = path.resolve(
  import.meta.dirname,
  ".auth/volunteer.json"
);
const unorientedVolunteerAuthFile = path.resolve(
  import.meta.dirname,
  ".auth/unoriented_volunteer.json"
);

async function authenticate(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
  attempt = 0
) {
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: { email, password },
  });
  console.log(`[auth] ${response.status()} POST ${response.url()}`);
  if (response.ok()) {
    await page.goto("/");
  }
  if (response.ok() && new URL(page.url()).pathname !== "/login") {
    return;
  }
  if (attempt >= 2) {
    throw new Error(`Authentication failed for ${email}`);
  }
  await page.waitForTimeout(500);
  await authenticate(page, email, password, attempt + 1);
}

setup("authenticate as super_admin", async ({ page }) => {
  await authenticate(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
  await page.context().storageState({ path: superAdminAuthFile });
});

setup("authenticate as admin", async ({ page }) => {
  await authenticate(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.context().storageState({ path: adminAuthFile });
});

setup("authenticate as finance_admin", async ({ page }) => {
  await authenticate(page, FINANCE_ADMIN_EMAIL, FINANCE_ADMIN_PASSWORD);
  await page.context().storageState({ path: financeAdminAuthFile });
});

setup("authenticate as volunteer", async ({ page }) => {
  await authenticate(page, VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD);
  await page.context().storageState({ path: volunteerAuthFile });
});

setup("authenticate as unoriented_volunteer", async ({ page }) => {
  await authenticate(
    page,
    UNORIENTED_VOLUNTEER_EMAIL,
    UNORIENTED_VOLUNTEER_PASSWORD
  );
  await page.context().storageState({ path: unorientedVolunteerAuthFile });
});

for (const [name, actor] of Object.entries(KALAKRITI_ACTORS)) {
  if (!("authFile" in actor)) {
    continue;
  }
  setup(`authenticate as Kalakriti ${name}`, async ({ page }) => {
    await authenticate(page, actor.email, actor.password);
    await page.context().storageState({
      path: path.resolve(import.meta.dirname, actor.authFile),
    });
  });
}
