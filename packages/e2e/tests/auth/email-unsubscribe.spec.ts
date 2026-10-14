import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../../.env.test"),
  quiet: true,
});

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/email-delivery.ts"
);
const TOPIC = "Events - Feedback";

async function fixture<T>(...args: string[]) {
  const { stdout } = await execFileAsync("bun", ["run", helperPath, ...args], {
    env: process.env,
  });
  return JSON.parse(stdout.trim()) as T;
}

function recipientEmail(): string {
  const email = process.env.KALAKRITI_UNRELATED_VOLUNTEER_EMAIL;
  if (!email) {
    throw new Error("KALAKRITI_UNRELATED_VOLUNTEER_EMAIL is not set");
  }
  return email;
}

test.describe("Email unsubscribe link", () => {
  test.describe.configure({ mode: "serial" });

  test.afterAll(async () => {
    await fixture("link", recipientEmail(), TOPIC);
  });

  test("opening the link changes nothing until the person confirms, and undo restores it", async ({
    page,
  }) => {
    const email = recipientEmail();
    const { path: linkPath } = await fixture<{ path: string }>(
      "link",
      email,
      TOPIC
    );

    await page.goto(linkPath);
    await expect(
      page.getByRole("heading", { name: "Unsubscribe from these emails?" })
    ).toBeVisible();
    await expect(page.getByText("Events · Feedback")).toBeVisible();
    expect(
      await fixture<{ emailEnabled: boolean }>("email-enabled", email, TOPIC)
    ).toEqual({ emailEnabled: true });

    await page.getByRole("button", { name: "Unsubscribe" }).click();
    await expect(
      page.getByRole("heading", { name: "You're unsubscribed" })
    ).toBeVisible();
    expect(
      await fixture<{ emailEnabled: boolean }>("email-enabled", email, TOPIC)
    ).toEqual({ emailEnabled: false });

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(
      page.getByRole("heading", { name: "Unsubscribe from these emails?" })
    ).toBeVisible();
    expect(
      await fixture<{ emailEnabled: boolean }>("email-enabled", email, TOPIC)
    ).toEqual({ emailEnabled: true });
  });

  test("one-click POST from a mail provider unsubscribes directly", async ({
    request,
  }) => {
    const email = recipientEmail();
    const { path: linkPath } = await fixture<{ path: string }>(
      "link",
      email,
      TOPIC
    );
    const query = linkPath.slice(linkPath.indexOf("?"));

    const response = await request.post(`/api/email/unsubscribe${query}`, {
      form: { "List-Unsubscribe": "One-Click" },
    });

    expect(response.status()).toBe(200);
    expect(
      await fixture<{ emailEnabled: boolean }>("email-enabled", email, TOPIC)
    ).toEqual({ emailEnabled: false });
  });

  test("a tampered link is refused", async ({ page, request }) => {
    const { path: linkPath } = await fixture<{ path: string }>(
      "link",
      recipientEmail(),
      TOPIC
    );
    const tampered = linkPath.replace(
      /sig=([0-9a-f])/,
      (_, first: string) => `sig=${first === "0" ? "1" : "0"}`
    );

    const response = await request.post(
      `/api/email/unsubscribe${tampered.slice(tampered.indexOf("?"))}`
    );
    expect(response.status()).toBe(400);

    await page.goto(tampered);
    await expect(
      page.getByRole("heading", { name: "This link doesn't work" })
    ).toBeVisible();
  });
});
