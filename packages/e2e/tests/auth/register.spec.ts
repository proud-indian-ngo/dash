import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, type Page, test } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../../.env.test"),
  quiet: true,
});

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/register-url-options.ts"
);

async function fixture<T>(
  action: "cleanup" | "setup" | "state",
  argument?: string
) {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...(argument ? [argument] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

async function fillRegisterForm(
  page: Page,
  { email, name, phone }: { email: string; name: string; phone: string }
) {
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.locator("#password").fill("Password123!");
  await page.getByLabel("Confirm password").fill("Password123!");
  await page.getByLabel("Phone").last().fill(phone);
  await page.getByRole("button", { name: "Date of birth" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const dayButton = dialog.getByRole("button", { name: /^Sunday/ }).first();
  await dayButton.waitFor({ state: "visible" });
  await dayButton.click();
  await page.getByLabel("Gender").click();
  await page.getByRole("option", { exact: true, name: "Male" }).click();
  await expect(page.getByRole("option")).toHaveCount(0, { timeout: 3000 });
  const registerBtn = page.getByRole("button", { name: "Register" });
  await expect(registerBtn).toBeEnabled({ timeout: 5000 });
  await registerBtn.click();
  await page.waitForURL("/login", { timeout: 30_000 });
  await expect(
    page.locator("[data-sonner-toast]").getByText("Registration successful")
  ).toBeVisible({ timeout: 10_000 });
}

let signupSeq = 0;

function uniqueSignup() {
  signupSeq += 1;
  const uniqueSuffix = `${Date.now()}${signupSeq}`;
  return {
    email: `e2e-register-${uniqueSuffix}@example.com`,
    phone: `+9199${uniqueSuffix.slice(-8)}`,
  };
}

test.describe("Register page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/register");
  });

  test("renders all form fields", async ({ page }) => {
    await expect(
      page.getByText("Create your account", { exact: true })
    ).toBeVisible();
    await expect(page.getByLabel("Name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByLabel("Confirm password")).toBeVisible();
    await expect(page.getByLabel("Phone")).toBeVisible();
    await expect(page.getByLabel("Date of birth")).toBeVisible();
    await expect(page.getByLabel("Gender")).toBeVisible();
    await expect(page.getByRole("button", { name: "Register" })).toBeVisible();
  });

  test("shows validation errors for required fields on empty submit", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Register" }).click();
    await expect(
      page.getByText("Name must be at least 2 characters")
    ).toBeVisible();
    await expect(page.getByText("Invalid email address")).toBeVisible();
    await expect(
      page.getByText("Password must be at least 8 characters").first()
    ).toBeVisible();
    await expect(page.getByText("Please select a gender")).toBeVisible();
  });

  test("shows password confirmation mismatch error", async ({ page }) => {
    await page.getByLabel("Name").fill("Test User");
    await page.getByLabel("Email").fill("mismatch@example.com");
    await page.locator("#password").fill("Password123!");
    await page.getByLabel("Confirm password").fill("DifferentPassword123!");
    await page
      .getByLabel("Phone")
      .last()
      .fill(`+9199${Date.now().toString().slice(-8)}`);
    // Open date picker and wait for the dialog to be stable before selecting
    await page.getByRole("button", { name: "Date of birth" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const dayButton = dialog.getByRole("button", { name: /^Sunday/ }).first();
    await dayButton.waitFor({ state: "visible" });
    await dayButton.click();
    // Select gender
    await page.getByLabel("Gender").click();
    await page.getByRole("option", { exact: true, name: "Male" }).click();
    // Blur the last field to trigger onChange validation
    await page.keyboard.press("Tab");
    // The register button should be disabled when form has validation errors
    await expect(page.getByRole("button", { name: "Register" })).toBeDisabled();
  });

  test("successful registration redirects to login with success toast", async ({
    page,
  }) => {
    const uniqueSuffix = Date.now().toString();
    const uniqueEmail = `e2e-register-${uniqueSuffix}@example.com`;
    const uniquePhone = `+9199${uniqueSuffix.slice(-8)}`;
    await page.getByLabel("Name").fill("E2E Test User");
    await page.getByLabel("Email").fill(uniqueEmail);
    await page.locator("#password").fill("Password123!");
    await page.getByLabel("Confirm password").fill("Password123!");
    await page.getByLabel("Phone").last().fill(uniquePhone);
    // Open date picker and wait for stability
    await page.getByRole("button", { name: "Date of birth" }).click();
    const regDialog = page.getByRole("dialog");
    await expect(regDialog).toBeVisible();
    const regDayBtn = regDialog
      .getByRole("button", { name: /^Sunday/ })
      .first();
    await regDayBtn.waitFor({ state: "visible" });
    await regDayBtn.click();
    // Select gender
    await page.getByLabel("Gender").click();
    await page.getByRole("option", { exact: true, name: "Male" }).click();
    const registerBtn = page.getByRole("button", { name: "Register" });
    await expect(registerBtn).toBeEnabled({ timeout: 5000 });
    // Ensure gender dropdown is fully closed before clicking Register
    await expect(page.getByRole("option")).toHaveCount(0, { timeout: 3000 });
    await registerBtn.click();
    await page.waitForURL("/login", { timeout: 30_000 });
    await expect(
      page.locator("[data-sonner-toast]").getByText("Registration successful")
    ).toBeVisible({ timeout: 10_000 });
  });

  test("duplicate email shows error toast", async ({ page }) => {
    await page.getByLabel("Name").fill("Duplicate User");
    await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL!);
    await page.locator("#password").fill("Password123!");
    await page.getByLabel("Confirm password").fill("Password123!");
    await page
      .getByLabel("Phone")
      .last()
      .fill(`+9199${Date.now().toString().slice(-8)}`);
    // Open date picker and wait for stability
    await page.getByRole("button", { name: "Date of birth" }).click();
    const dupDialog = page.getByRole("dialog");
    await expect(dupDialog).toBeVisible();
    const dupDayBtn = dupDialog
      .getByRole("button", { name: /^Sunday/ })
      .first();
    await dupDayBtn.waitFor({ state: "visible" });
    await dupDayBtn.click();
    // Select gender
    await page.getByLabel("Gender").click();
    await page.getByRole("option", { name: "Female" }).click();
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page.locator("[data-sonner-toast]")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("duplicate email with eventId does not enroll the existing user", async ({
    page,
  }) => {
    const creatorEmail = process.env.ADMIN_EMAIL;
    if (!creatorEmail) {
      throw new Error("ADMIN_EMAIL is required for register URL fixtures");
    }
    const ids = await fixture<{ normalEventId: string }>("setup", creatorEmail);
    try {
      await page.goto(`/register?eventId=${ids.normalEventId}`);
      await page.getByLabel("Name").fill("Duplicate Event User");
      await page.getByLabel("Email").fill(creatorEmail);
      await page.locator("#password").fill("Password123!");
      await page.getByLabel("Confirm password").fill("Password123!");
      await page
        .getByLabel("Phone")
        .last()
        .fill(`+9199${Date.now().toString().slice(-8)}`);
      await page.getByRole("button", { name: "Date of birth" }).click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("button", { name: /^Sunday/ })
        .first()
        .click();
      await page.getByLabel("Gender").click();
      await page.getByRole("option", { exact: true, name: "Female" }).click();
      await page.getByRole("button", { name: "Register" }).click();
      await expect(page.locator("[data-sonner-toast]")).toBeVisible({
        timeout: 10_000,
      });
      await expect
        .poll(async () => fixture("state", creatorEmail), { timeout: 15_000 })
        .toMatchObject({
          eventMember: false,
          registrationGroup: null,
        });
    } finally {
      await fixture("cleanup");
    }
  });

  test("login link navigates to /login", async ({ page }) => {
    await expect(page.getByText("Already have an account?")).toBeVisible();
    await page.getByText("Login").click();
    await page.waitForURL("/login");
  });
});

test.describe("Register URL options", () => {
  test.describe.configure({ mode: "serial" });
  test("stores group and event membership independently", async ({ page }) => {
    const creatorEmail = process.env.ADMIN_EMAIL;
    if (!creatorEmail) {
      throw new Error("ADMIN_EMAIL is required for register URL fixtures");
    }
    const ids = await fixture<{
      kalakritiEventId: string;
      normalEventId: string;
    }>("setup", creatorEmail);

    try {
      const groupOnly = uniqueSignup();
      await page.goto("/register?group=campus-west");
      await expect(
        page.getByText("Create your account", { exact: true })
      ).toBeVisible();
      await expect(page.locator("[data-register-group]")).toHaveAttribute(
        "data-register-group",
        "campus-west"
      );
      await fillRegisterForm(page, {
        email: groupOnly.email,
        name: "Group Only User",
        phone: groupOnly.phone,
      });
      await expect
        .poll(async () => fixture("state", groupOnly.email), {
          timeout: 15_000,
        })
        .toEqual({
          assignmentCount: 0,
          eventMember: false,
          kalakritiEventMember: false,
          membershipState: null,
          registrationGroup: "campus-west",
        });

      const eventOnly = uniqueSignup();
      await page.goto(`/register?eventId=${ids.normalEventId}`);
      await expect(
        page.getByText("Create your account", { exact: true })
      ).toBeVisible();
      await expect(page.locator("[data-register-event-id]")).toHaveAttribute(
        "data-register-event-id",
        ids.normalEventId
      );
      await fillRegisterForm(page, {
        email: eventOnly.email,
        name: "Event Only User",
        phone: eventOnly.phone,
      });
      await expect
        .poll(async () => fixture("state", eventOnly.email), {
          timeout: 15_000,
        })
        .toEqual({
          assignmentCount: 0,
          eventMember: true,
          kalakritiEventMember: false,
          membershipState: null,
          registrationGroup: null,
        });

      const both = uniqueSignup();
      await page.goto(
        `/register?eventId=${ids.normalEventId}&group=campus-west`
      );
      await fillRegisterForm(page, {
        email: both.email,
        name: "Both Options User",
        phone: both.phone,
      });
      await expect
        .poll(async () => fixture("state", both.email), {
          timeout: 15_000,
        })
        .toEqual({
          assignmentCount: 0,
          eventMember: true,
          kalakritiEventMember: false,
          membershipState: null,
          registrationGroup: "campus-west",
        });
    } finally {
      await fixture("cleanup");
    }
  });

  test("Kalakriti-linked eventId creates an unassigned Edition volunteer", async ({
    page,
  }) => {
    const creatorEmail = process.env.ADMIN_EMAIL;
    if (!creatorEmail) {
      throw new Error("ADMIN_EMAIL is required for register URL fixtures");
    }
    const ids = await fixture<{
      kalakritiEventId: string;
      normalEventId: string;
    }>("setup", creatorEmail);

    try {
      const signup = uniqueSignup();
      await page.goto(`/register?eventId=${ids.kalakritiEventId}`);
      await expect(
        page.getByText("Create your account", { exact: true })
      ).toBeVisible();
      await expect(page.locator("[data-register-event-id]")).toHaveAttribute(
        "data-register-event-id",
        ids.kalakritiEventId
      );
      await fillRegisterForm(page, {
        email: signup.email,
        name: "Kalakriti Signup User",
        phone: signup.phone,
      });
      await expect
        .poll(async () => fixture("state", signup.email), {
          timeout: 15_000,
        })
        .toEqual({
          assignmentCount: 0,
          eventMember: false,
          kalakritiEventMember: true,
          membershipState: "active",
          registrationGroup: null,
        });
    } finally {
      await fixture("cleanup");
    }
  });
});
