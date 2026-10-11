import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/social-page.ts"
);

async function fixture<T>(action: "cleanup" | "inspect" | "setup") {
  const { stdout } = await execFileAsync("bun", ["run", helperPath, action], {
    env: process.env,
  });
  return JSON.parse(stdout.trim()) as T;
}

test.describe("Social page", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "admin",
      "admin holds social.manage but not settings.app_config"
    );
  });

  test("an admin pauses posting, sees a reported run and drops a queued post", async ({
    page,
    request,
  }) => {
    test.slow();
    const { runMarker, token } = await fixture<{
      runMarker: number;
      token: string;
    }>("setup");
    const auth = { Authorization: `Bearer ${token}` };

    try {
      // Settings: pause all posts; the generator reads it back.
      await page.goto("/social?tab=settings");
      await waitForZeroReady(page);
      const pauseAll = page.getByRole("switch", { name: "Pause all posts" });
      await expect(pauseAll).not.toBeChecked({ timeout: 15_000 });
      await pauseAll.click();
      await expect(pauseAll).toBeChecked();
      await expect(
        page.getByText("All social posts are paused.")
      ).toBeVisible();

      await expect
        .poll(
          async () => {
            const response = await request.get("/api/social/v1/settings", {
              headers: auth,
            });
            expect(response.status()).toBe(200);
            expect(response.headers()["cache-control"]).toBe("no-store");
            return response.json();
          },
          { timeout: 10_000 }
        )
        .toEqual({ paused: true, pausedKinds: [], rules: {} });

      // Runs: a reported run shows up live, with its skipped reasons.
      const report = await request.post("/api/social/v1/runs", {
        data: {
          digestSent: false,
          dropped: 0,
          errors: [],
          eventsSeen: runMarker,
          finishedAt: new Date().toISOString(),
          planned: 2,
          recorded: 1,
          rendered: 1,
          skipped: ["recap e2e: no usable photos"],
          startedAt: new Date(Date.now() - 60_000).toISOString(),
          tick: "hourly",
        },
        headers: auth,
      });
      expect(report.status()).toBe(204);

      await page.getByRole("tab", { name: "Runs" }).click();
      const runRow = page
        .getByRole("row")
        .filter({ hasText: String(runMarker) })
        .first();
      await expect(runRow).toBeVisible({ timeout: 15_000 });
      await expect(runRow).toContainText("Hourly");
      await runRow.getByRole("button").first().click();
      await expect(page.getByText("recap e2e: no usable photos")).toBeVisible();

      // Posts: drop the queued post.
      await page.getByRole("tab", { name: "Posts" }).click();
      const postRow = page
        .getByRole("row")
        .filter({ hasText: "Social page E2E session" })
        .first();
      await expect(postRow).toBeVisible({ timeout: 15_000 });
      await expect(postRow).toContainText("Queued");
      await postRow.getByRole("button", { name: "Row actions" }).click();
      await page.getByRole("menuitem", { name: "Drop post" }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText("Drop this post?");
      await dialog.getByRole("button", { name: "Drop post" }).click();
      await expect(postRow).toContainText("Dropped", { timeout: 10_000 });
      await expect(
        postRow.getByRole("button", { name: "Row actions" })
      ).toHaveCount(0);

      await expect
        .poll(async () => (await fixture<{ status: string }>("inspect")).status)
        .toBe("dropped");
      const dropped = await fixture<{
        droppedAt: string | null;
        droppedBy: string | null;
        droppedByName: string | null;
      }>("inspect");
      expect(dropped.droppedAt).not.toBeNull();
      expect(dropped.droppedBy).not.toBeNull();
      // The dropper's name resolves through getSocialPeople.
      await expect(postRow).toContainText(dropped.droppedByName ?? "", {
        timeout: 10_000,
      });
      await expect(postRow).toContainText("IST");
    } finally {
      await fixture("cleanup");
    }
  });

  test("an admin saves a posting rule and resets the rules", async ({
    page,
    request,
  }) => {
    test.slow();
    const { token } = await fixture<{ token: string }>("setup");
    const auth = { Authorization: `Bearer ${token}` };
    const rules = async () => {
      const response = await request.get("/api/social/v1/settings", {
        headers: auth,
      });
      expect(response.status()).toBe(200);
      return (await response.json()).rules;
    };

    try {
      await page.goto("/social?tab=settings");
      await waitForZeroReady(page);
      const recap = page
        .locator("[data-slot=card]")
        .filter({ hasText: "Recap" })
        .filter({ hasText: "Closing line" });
      const postTime = recap.getByLabel("Post time");
      await expect(postTime).toHaveAttribute("placeholder", "20:00", {
        timeout: 15_000,
      });
      const held = recap.getByRole("switch", {
        name: "Hold recaps for approval",
      });
      await expect(held).toBeChecked();

      // Out-of-range input is refused before anything is written.
      await recap.getByLabel("Look back (days)").fill("30");
      await page.getByRole("button", { name: "Save rules" }).click();
      await expect(
        recap.getByText("Use a whole number from 0 to 14")
      ).toBeVisible();
      await recap.getByLabel("Look back (days)").fill("");

      await postTime.fill("21:15");
      await held.click();
      await page.getByRole("button", { name: "Save rules" }).click();
      await expect
        .poll(rules, { timeout: 10_000 })
        .toEqual({ recap: { held: false, postTime: "21:15" } });

      await page.reload();
      await waitForZeroReady(page);
      await expect(recap.getByLabel("Post time")).toHaveValue("21:15", {
        timeout: 15_000,
      });
      await expect(held).not.toBeChecked();

      await page.getByRole("button", { name: "Reset to defaults" }).click();
      const dialog = page.getByRole("alertdialog");
      await dialog.getByRole("button", { name: "Reset rules" }).click();
      await expect.poll(rules, { timeout: 10_000 }).toEqual({});
      await expect(recap.getByLabel("Post time")).toHaveValue("");
      await expect(held).toBeChecked();
    } finally {
      await fixture("cleanup");
    }
  });
});
