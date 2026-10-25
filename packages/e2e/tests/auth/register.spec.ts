import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, type Page, test } from "@playwright/test";
import dotenv from "dotenv";

import { clickPageAction } from "../../helpers/page-header";

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
  action: "cleanup" | "interest" | "link" | "setup" | "state" | "token",
  argument?: string
) {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...(argument ? [argument] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

async function signUpViaApi(
  page: Page,
  signup: ReturnType<typeof uniqueSignup>,
  options: { eventId?: string; sig?: string } = {}
) {
  const response = await page.request.post("/api/auth/sign-up/email", {
    data: {
      dob: "1990-01-01T00:00:00.000Z",
      email: signup.email,
      gender: "male",
      name: "Event Registration Test User",
      password: "Password123!",
      phone: signup.phone,
      ...(options.eventId ? { registerEventId: options.eventId } : {}),
      ...(options.sig ? { registerEventSig: options.sig } : {}),
    },
    headers: {
      ...(options.eventId ? { "x-register-event-id": options.eventId } : {}),
      ...(options.sig ? { "x-register-event-sig": options.sig } : {}),
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
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
  // The picker opens on the latest allowed month and disables later days;
  // outside days keep an enabled Sunday on screen in every month.
  const dayButton = dialog
    .getByRole("button", { disabled: false, name: /^Sunday/ })
    .first();
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
  // The URL changes before the login loader (event summary) settles; the
  // register form stays mounted until then and would take the next fills.
  await expect(
    page.getByRole("heading", { name: "Log in", exact: true })
  ).toBeVisible({ timeout: 15_000 });
}

interface SignupLink {
  eventId: string;
  path: string;
  sig: string;
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
    const dayButton = dialog
      .getByRole("button", { disabled: false, name: /^Sunday/ })
      .first();
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
      .getByRole("button", { disabled: false, name: /^Sunday/ })
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
      .getByRole("button", { disabled: false, name: /^Sunday/ })
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

  test("duplicate email with an event link does not enroll the existing user", async ({
    page,
  }) => {
    const creatorEmail = process.env.ADMIN_EMAIL;
    if (!creatorEmail) {
      throw new Error("ADMIN_EMAIL is required for register URL fixtures");
    }
    const ids = await fixture<{ normalEventId: string }>("setup", creatorEmail);
    const signupLink = await fixture<SignupLink>("link", ids.normalEventId);
    try {
      await page.goto(signupLink.path);
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
        .getByRole("button", { disabled: false, name: /^Sunday/ })
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

  test("sign-up API rejects volunteers under 18", async ({ page }) => {
    const signup = uniqueSignup();
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 17);
    const response = await page.request.post("/api/auth/sign-up/email", {
      data: {
        dob: dob.toISOString(),
        email: signup.email,
        gender: "male",
        name: "Underage User",
        password: "Password123!",
        phone: signup.phone,
      },
    });
    expect(response.status()).toBe(400);
    expect(await response.text()).toContain("at least 18 years old");
    expect(await fixture("state", signup.email)).toMatchObject({ role: null });
  });

  test("date picker only offers dates at least 18 years ago", async ({
    page,
  }) => {
    await expect(
      page.getByText("You must be at least 18 to register as a volunteer.")
    ).toBeVisible();
    const today = new Date();
    const latest = new Date(
      today.getFullYear() - 18,
      today.getMonth(),
      today.getDate()
    );
    const dayLabel = (date: Date) =>
      new RegExp(
        `${date.toLocaleString("en-US", { month: "long" })} ${date.getDate()}(st|nd|rd|th), ${date.getFullYear()}`
      );
    await page.getByRole("button", { name: "Date of birth" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("button", { name: dayLabel(latest) })
    ).toBeEnabled();
    const nextDay = new Date(latest);
    nextDay.setDate(latest.getDate() + 1);
    if (nextDay.getMonth() === latest.getMonth()) {
      await expect(
        dialog.getByRole("button", { name: dayLabel(nextDay) })
      ).toBeDisabled();
    }
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
      const eventOnlyLink = await fixture<SignupLink>(
        "link",
        ids.normalEventId
      );
      await page.goto(eventOnlyLink.path);
      await expect(
        page.getByText("Create your account", { exact: true })
      ).toBeVisible();
      await expect(page.locator("[data-register-event-id]")).toHaveAttribute(
        "data-register-event-id",
        eventOnlyLink.eventId
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
      const bothLink = await fixture<SignupLink>("link", ids.normalEventId);
      await page.goto(`${bothLink.path}&group=campus-west`);
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

  test("an organiser hands out a signed sign-up link from the event page", async ({
    browser,
    page,
  }) => {
    const creatorEmail = process.env.ADMIN_EMAIL;
    if (!creatorEmail) {
      throw new Error("ADMIN_EMAIL is required for register URL fixtures");
    }
    const ids = await fixture<{ normalEventId: string }>("setup", creatorEmail);
    const organiser = await browser.newContext({
      storageState: path.resolve(
        import.meta.dirname,
        "../../.auth/super_admin.json"
      ),
    });

    try {
      const organiserPage = await organiser.newPage();
      await organiserPage.goto(`/events/${ids.normalEventId}`);
      await clickPageAction(organiserPage, "Sign-up link");
      const dialog = organiserPage.getByRole("dialog");
      await dialog.getByRole("button", { name: "Get link" }).click();
      const linkInput = dialog.getByRole("textbox", { name: "Sign-up link" });
      await expect(linkInput).toHaveValue(/\/register\?eventId=.+&sig=/);
      const link = new URL(await linkInput.inputValue());
      await dialog.getByRole("button", { name: "Done" }).click();

      const signup = uniqueSignup();
      await page.goto(`${link.pathname}${link.search}`);
      await fillRegisterForm(page, {
        email: signup.email,
        name: "Sign-up Link User",
        phone: signup.phone,
      });
      await expect
        .poll(async () => fixture("state", signup.email), {
          timeout: 15_000,
        })
        .toMatchObject({ eventMember: true });

      // The same event ID without its signature is a public ID.
      const bareId = uniqueSignup();
      await signUpViaApi(page, bareId, {
        eventId: link.searchParams.get("eventId") ?? "",
      });
      await expect
        .poll(async () => fixture("state", bareId.email), {
          timeout: 15_000,
        })
        .toMatchObject({ eventMember: false });
    } finally {
      await organiser.close();
      await fixture("cleanup");
    }
  });

  test("a Kalakriti sign-up link creates unassigned Edition volunteers", async ({
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
      const signupLink = await fixture<SignupLink>(
        "link",
        ids.kalakritiEventId
      );
      await page.goto(signupLink.path);
      await expect(
        page.getByText("Create your account", { exact: true })
      ).toBeVisible();
      await expect(page.locator("[data-register-event-id]")).toHaveAttribute(
        "data-register-event-id",
        signupLink.eventId
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

      // The link is shared, so a second sign-up through it enrolls too.
      const second = uniqueSignup();
      await signUpViaApi(page, second, signupLink);
      await expect
        .poll(async () => fixture("state", second.email), { timeout: 15_000 })
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

  test("public Kalakriti IDs and forged links cannot enroll or promote", async ({
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
      const scheduleResponse = await page.request.get(
        "/api/kalakriti/2095/schedule"
      );
      expect(scheduleResponse.ok()).toBe(true);
      const schedule = (await scheduleResponse.json()) as {
        edition: { eventId: string };
      };
      expect(schedule.edition.eventId).toBe(ids.kalakritiEventId);

      const normalLink = await fixture<SignupLink>("link", ids.normalEventId);
      const attempts = [
        // The public ID alone.
        { eventId: schedule.edition.eventId },
        // Another event's signature.
        { eventId: schedule.edition.eventId, sig: normalLink.sig },
        // A forged signature.
        { eventId: schedule.edition.eventId, sig: "0".repeat(64) },
      ];
      for (const attempt of attempts) {
        const signup = uniqueSignup();
        await signUpViaApi(page, signup, attempt);
        await expect
          .poll(async () => fixture("state", signup.email), {
            timeout: 15_000,
          })
          .toEqual({
            assignmentCount: 0,
            eventMember: false,
            kalakritiEventMember: false,
            membershipState: null,
            registrationGroup: null,
            role: "unoriented_volunteer",
          });
      }
    } finally {
      await fixture("cleanup");
    }
  });
});

test.describe("Public website sign-up links", () => {
  test.describe.configure({ mode: "serial" });

  /**
   * Open the link from a verification email and confirm, as the person
   * would. It signs the account in and opens the event.
   */
  async function verifyEmail(page: Page, email: string, redirect: string) {
    const { token } = await fixture<{ token: string }>("token", email);
    await page.goto(
      `/verify-email?token=${token}&redirect=${encodeURIComponent(redirect)}`
    );
    await page.getByRole("button", { name: "Confirm email" }).click();
    await page.waitForURL((url) => url.pathname !== "/verify-email", {
      timeout: 30_000,
    });
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
        "Iblur, Bangalore"
      );
      await expect(page.getByTestId("auth-event-info-panel")).toContainText(
        "Join Register URL public event"
      );
      await expect(page.getByRole("link", { name: "Log in" })).toHaveAttribute(
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
      // Login keeps the session in its panel, and Register keeps the sign-up.
      await expect(page.getByTestId("auth-event-info-panel")).toContainText(
        "Log in to join Register URL public event"
      );
      await expect(
        page.getByRole("link", { name: "Create an account" })
      ).toHaveAttribute(
        "href",
        `/register?interestEventId=${ids.publicEventId}`
      );

      // Nothing reaches the team until the email is verified.
      expect(await fixture("interest", signup.email)).toMatchObject({
        interestStatus: null,
        publicEventMember: false,
      });

      // Verifying signs the account in and lands on the event.
      await verifyEmail(page, signup.email, linkRedirect);
      expect(new URL(page.url()).pathname).toBe(eventPath);
      // A pending request for a lead to approve, never a direct enrollment.
      await expect
        .poll(async () => fixture("interest", signup.email), {
          timeout: 15_000,
        })
        .toMatchObject({ interestStatus: "pending", publicEventMember: false });
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
      await page.getByRole("button", { name: "Log in" }).click();
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
