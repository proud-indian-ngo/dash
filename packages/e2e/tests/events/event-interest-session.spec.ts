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
  "../../helpers/public-events-feed.ts"
);

async function fixture<T>(
  action: "session-cleanup" | "session-setup",
  argument?: string
) {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...(argument ? [argument] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

test.describe("Event interest in a recurring session", () => {
  test("files interest on that session and opens it", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    const creatorEmail = process.env.ADMIN_EMAIL;
    if (!creatorEmail) {
      throw new Error("ADMIN_EMAIL is required for the session fixture");
    }
    const { occDate, seriesId } = await fixture<{
      occDate: string;
      seriesId: string;
    }>("session-setup", creatorEmail);

    try {
      await page.goto(`/events/${seriesId}?occDate=${occDate}`);
      await page.getByRole("button", { name: "Show Interest" }).click();
      await page.getByRole("button", { name: "Submit Interest" }).click();

      // The session is materialized and opened, showing the request on it.
      await page.waitForURL(
        (url) =>
          url.pathname.startsWith("/events/") &&
          !url.pathname.endsWith(seriesId),
        { timeout: 15_000 }
      );
      await expect(page.getByText("Interest Pending")).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await fixture("session-cleanup");
    }
  });
});
