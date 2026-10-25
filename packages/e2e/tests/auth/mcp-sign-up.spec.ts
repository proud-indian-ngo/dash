import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "@playwright/test";
import dotenv from "dotenv";

import { callTool } from "../../helpers/mcp";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../../.env.test"),
  quiet: true,
});

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/mcp-sign-up.ts"
);

async function fixture<T>(
  action: "cleanup" | "code" | "setup" | "state" | "token",
  argument?: string
) {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...(argument ? [argument] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

interface AccountState {
  emailVerified?: boolean;
  exists: boolean;
  hasPassword?: boolean;
  interests?: { originalDate: string | null; status: string }[];
  phone?: string;
  role?: string;
  sessions?: number;
}

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test.describe("Assistant sign-up", () => {
  test.describe.configure({ mode: "serial" });

  let series: { occDate: string; seriesId: string };

  test.beforeAll(async () => {
    const creatorEmail = process.env.ADMIN_EMAIL;
    if (!creatorEmail) {
      throw new Error("ADMIN_EMAIL is required for the sign-up fixture");
    }
    series = await fixture("setup", creatorEmail);
  });

  test.afterAll(async () => {
    await fixture("cleanup");
  });

  test("signs a new volunteer up; opening the email signs them in, sets a password and files the interest", async ({
    page,
    request,
  }, testInfo) => {
    const id = unique();
    const email = `e2e-mcp-signup-${id}@example.com`;
    const details = {
      dateOfBirth: "1995-04-02",
      email,
      eventId: series.seriesId,
      name: "Assistant Signup",
      occDate: series.occDate,
      // An Indian number without its country code.
      phone: `9${id.slice(-9)}`,
    };

    const first = await callTool(request, "start_volunteer_signup", details);
    expect(first.isError).toBe(false);
    const message = first.content[0]?.text ?? "";
    expect(message).toContain(`If ${email} is new to Proud Indian`);
    expect(message).toContain(
      `/register?interestEventId=${series.seriesId}&occDate=${series.occDate}`
    );

    // Nothing reaches the team, and nobody can sign in, until the email is
    // confirmed.
    const created = await fixture<AccountState>("state", email);
    expect(created).toMatchObject({
      emailVerified: false,
      exists: true,
      hasPassword: false,
      interests: [],
      phone: `+91${details.phone}`,
      role: "unoriented_volunteer",
    });

    // Asking again answers the same, so the tool can't reveal who has an
    // account.
    const again = await callTool(request, "start_volunteer_signup", details);
    expect(again.content[0]?.text).toBe(message);

    const { token } = await fixture<{ token: string }>("token", email);
    const redirect = `/events/${series.seriesId}?occDate=${series.occDate}&interest=1`;
    await page.goto(
      `/verify-email?token=${token}&redirect=${encodeURIComponent(redirect)}`
    );
    // Opening the link, as a mail scanner does, changes nothing.
    await expect(
      page.getByRole("button", { name: "Confirm email" })
    ).toBeVisible();
    expect(await fixture<AccountState>("state", email)).toMatchObject({
      emailVerified: false,
      sessions: 0,
    });
    await page.getByRole("button", { name: "Confirm email" }).click();
    await page.waitForURL(/\/set-password\?/, { timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: "Set your password" })
    ).toBeVisible();
    await page.getByLabel("New password").fill("Password123!");
    await page.getByLabel("Confirm password").fill("Password123!");
    await page.getByRole("button", { name: "Set password" }).click();
    await page.waitForURL(
      (url) => url.pathname.startsWith(`/events/${series.seriesId}`),
      { timeout: 30_000 }
    );

    await expect
      .poll(async () => fixture<AccountState>("state", email), {
        timeout: 15_000,
      })
      .toMatchObject({
        emailVerified: true,
        hasPassword: true,
        interests: [{ originalDate: series.occDate, status: "pending" }],
      });

    // The password works for the next sign-in.
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.locator("#password").fill("Password123!");
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 30_000 });

    await testInfo.attach("assistant-sign-up.json", {
      body: JSON.stringify(
        {
          afterVerification: await fixture<AccountState>("state", email),
          beforeVerification: created,
          toolMessage: message,
        },
        null,
        2
      ),
      contentType: "application/json",
    });
  });

  test("a new volunteer reads the emailed code back to the assistant instead", async ({
    request,
  }, testInfo) => {
    const id = unique();
    const email = `e2e-mcp-signup-${id}@example.com`;
    const started = await callTool(request, "start_volunteer_signup", {
      dateOfBirth: "1996-08-15",
      email,
      eventId: series.seriesId,
      name: "Assistant Code",
      occDate: series.occDate,
      phone: `6${id.slice(-9)}`,
    });
    expect(started.isError).toBe(false);
    expect(started.content[0]?.text).toContain("6-digit code");

    const { code } = await fixture<{ code: string }>("code", email);
    const confirmation = {
      email,
      eventId: series.seriesId,
      occDate: series.occDate,
    };

    const wrong = await callTool(request, "confirm_volunteer_signup", {
      ...confirmation,
      code: "000000",
    });
    expect(wrong.isError).toBe(true);
    expect(wrong.content[0]?.text).toContain("That code didn't work");
    expect(await fixture<AccountState>("state", email)).toMatchObject({
      emailVerified: false,
      interests: [],
    });

    const confirmed = await callTool(request, "confirm_volunteer_signup", {
      ...confirmation,
      code,
    });
    expect(confirmed.isError).toBe(false);
    expect(confirmed.content[0]?.text).toContain("Confirmed.");

    // Verified with the interest filed, and no one signed in: the person sets
    // a password from the email that follows.
    await expect
      .poll(async () => fixture<AccountState>("state", email), {
        timeout: 15_000,
      })
      .toMatchObject({
        emailVerified: true,
        hasPassword: false,
        interests: [{ originalDate: series.occDate, status: "pending" }],
        sessions: 0,
      });

    // A used code doesn't work twice.
    const reused = await callTool(request, "confirm_volunteer_signup", {
      ...confirmation,
      code,
    });
    expect(reused.isError).toBe(true);

    await testInfo.attach("assistant-sign-up-code.json", {
      body: JSON.stringify(
        {
          afterConfirmation: await fixture<AccountState>("state", email),
          confirmMessage: confirmed.content[0]?.text,
          wrongCodeMessage: wrong.content[0]?.text,
        },
        null,
        2
      ),
      contentType: "application/json",
    });
  });

  test("refuses under-18s, unknown sessions and a series without a date", async ({
    request,
  }) => {
    const id = unique();
    const base = {
      dateOfBirth: "1995-04-02",
      email: `e2e-mcp-signup-${id}@example.com`,
      eventId: series.seriesId,
      name: "Assistant Refusals",
      occDate: series.occDate,
      phone: `8${id.slice(-9)}`,
    };

    const minor = await callTool(request, "start_volunteer_signup", {
      ...base,
      dateOfBirth: `${new Date().getUTCFullYear() - 10}-01-01`,
    });
    expect(minor.isError).toBe(true);
    expect(minor.content[0]?.text).toMatch(/18/);

    const unknown = await callTool(request, "start_volunteer_signup", {
      ...base,
      eventId: "019f0000-0021-7000-8000-0000000022ff",
    });
    expect(unknown.isError).toBe(true);
    expect(unknown.content[0]?.text).toContain("no such public session");

    const noDate = await callTool(request, "start_volunteer_signup", {
      ...base,
      occDate: undefined,
    });
    expect(noDate.isError).toBe(true);
    expect(noDate.content[0]?.text).toContain("occDate");

    expect(await fixture<AccountState>("state", base.email)).toEqual({
      exists: false,
    });
  });

  test("an existing account gets the same answer and no new account", async ({
    request,
  }) => {
    const email = process.env.ADMIN_EMAIL ?? "";
    const result = await callTool(request, "start_volunteer_signup", {
      dateOfBirth: "1990-01-01",
      email,
      eventId: series.seriesId,
      name: "Someone Else",
      occDate: series.occDate,
      phone: `7${unique().slice(-9)}`,
    });
    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toContain(`If ${email} is new`);
  });
});
