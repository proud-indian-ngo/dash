import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, type Page, test } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../../.env.test"),
  quiet: true,
});

// Both describes share the register URL database fixture and its cleanup.
test.describe.configure({ mode: "default" });

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/register-url-options.ts"
);

async function fixture<T>(
  action: "cleanup" | "interest" | "setup" | "state" | "token",
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
  // Event links continue to /login?redirect=/events/<id>.
  await page.waitForURL(/\/login(\?|$)/, { timeout: 30_000 });
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
          role: "unoriented_volunteer",
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
          role: "unoriented_volunteer",
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
          role: "unoriented_volunteer",
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
          role: "volunteer",
        });
    } finally {
      await fixture("cleanup");
    }
  });
});

test.describe("Public website sign-up links", () => {
  test.describe.configure({ mode: "serial" });

  /** Open the link from a verification email, as the inbox would. */
  async function verifyEmail(page: Page, email: string, redirect: string) {
    const { token } = await fixture<{ token: string }>("token", email);
    await page.goto(
      `/verify-email?token=${token}&redirect=${encodeURIComponent(redirect)}`
    );
    await page.waitForURL(/\/login\?/, { timeout: 30_000 });
  }

  test("files a pending interest once verified and lands on the event", async ({
    page,
  }) => {
    const creatorEmail = process.env.ADMIN_EMAIL;
    if (!creatorEmail) {
      throw new Error("ADMIN_EMAIL is required for register URL fixtures");
    }
    const ids = await fixture<{ publicEventId: string }>("setup", creatorEmail);
    const eventPath = `/events/${ids.publicEventId}`;
    const linkRedirect = `${eventPath}?interest=1`;

    try {
      const signup = uniqueSignup();
      await page.goto(`/register?interestEventId=${ids.publicEventId}`);
      await expect(page.getByTestId("register-event-banner")).toContainText(
        "Register URL public event"
      );
      await expect(page.getByTestId("register-event-banner")).toContainText(
        "Iblur, Bengaluru"
      );
      await expect(page.getByRole("link", { name: "Login" })).toHaveAttribute(
        "href",
        `/login?redirect=${encodeURIComponent(linkRedirect)}`
      );
      await fillRegisterForm(page, {
        email: signup.email,
        name: "Website Signup User",
        phone: signup.phone,
      });
      expect(new URL(page.url()).searchParams.get("redirect")).toBe(
        linkRedirect
      );

      // Nothing reaches the team until the email is verified.
      expect(await fixture("interest", signup.email)).toMatchObject({
        interestStatus: null,
        publicEventMember: false,
      });

      await verifyEmail(page, signup.email, linkRedirect);
      expect(new URL(page.url()).searchParams.get("redirect")).toBe(eventPath);
      // A pending request for a lead to approve, never a direct enrollment.
      await expect
        .poll(async () => fixture("interest", signup.email), {
          timeout: 15_000,
        })
        .toMatchObject({ interestStatus: "pending", publicEventMember: false });

      await page.getByLabel("Email").fill(signup.email);
      await page.locator("#password").fill("Password123!");
      await page.getByRole("button", { name: "Login" }).click();
      await page.waitForURL(eventPath, { timeout: 30_000 });
      await expect(page.getByText("Interest Pending")).toBeVisible({
        timeout: 15_000,
      });

      // Signed-in volunteers following the website link go straight to the event.
      await page.goto(`/register?interestEventId=${ids.publicEventId}`);
      await page.waitForURL(eventPath, { timeout: 15_000 });
    } finally {
      await fixture("cleanup");
    }
  });

  test("keeps the event in re-sent verification emails", async ({ page }) => {
    const creatorEmail = process.env.ADMIN_EMAIL;
    if (!creatorEmail) {
      throw new Error("ADMIN_EMAIL is required for register URL fixtures");
    }
    const ids = await fixture<{ publicEventId: string }>("setup", creatorEmail);
    const linkRedirect = `/events/${ids.publicEventId}?interest=1`;

    try {
      const signup = uniqueSignup();
      await page.goto(`/register?interestEventId=${ids.publicEventId}`);
      await fillRegisterForm(page, {
        email: signup.email,
        name: "Website Resend User",
        phone: signup.phone,
      });

      // An unverified sign-in makes Better Auth re-send the verification
      // email; the login form passes the event in a header, not callbackURL.
      const signIn = page.waitForRequest("**/api/auth/sign-in/email");
      await page.getByLabel("Email").fill(signup.email);
      await page.locator("#password").fill("Password123!");
      await page.getByRole("button", { name: "Login" }).click();
      const signInRequest = await signIn;
      expect(await signInRequest.headerValue("x-auth-event-redirect")).toBe(
        linkRedirect
      );
      expect(signInRequest.postDataJSON()).not.toHaveProperty("callbackURL");
      await expect(page.getByText("has not been verified")).toBeVisible();

      // The manual resend carries the same event.
      const resend = page.waitForRequest("**/api/auth/send-verification-email");
      await page.getByRole("button", { name: /resend/i }).click();
      expect((await resend).postDataJSON()).toMatchObject({
        callbackURL: linkRedirect,
      });
    } finally {
      await fixture("cleanup");
    }
  });

  test("files interest on the chosen session of a recurring series", async ({
    page,
  }) => {
    const creatorEmail = process.env.ADMIN_EMAIL;
    if (!creatorEmail) {
      throw new Error("ADMIN_EMAIL is required for register URL fixtures");
    }
    const ids = await fixture<{ seriesEventId: string; seriesOccDate: string }>(
      "setup",
      creatorEmail
    );

    try {
      const signup = uniqueSignup();
      await page.goto(
        `/register?interestEventId=${ids.seriesEventId}&occDate=${ids.seriesOccDate}`
      );
      await expect(page.getByTestId("register-event-banner")).toContainText(
        "Register URL weekly session"
      );
      await fillRegisterForm(page, {
        email: signup.email,
        name: "Website Session User",
        phone: signup.phone,
      });
      await verifyEmail(
        page,
        signup.email,
        `/events/${ids.seriesEventId}?occDate=${ids.seriesOccDate}&interest=1`
      );

      await expect
        .poll(async () => fixture("interest", signup.email), {
          timeout: 15_000,
        })
        .toMatchObject({
          seriesSessionInterest: {
            originalDate: ids.seriesOccDate,
            status: "pending",
          },
        });
    } finally {
      await fixture("cleanup");
    }
  });
});
