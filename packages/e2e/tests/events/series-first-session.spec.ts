import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/series-first-session.ts"
);

async function fixture<T>(
  action: "cleanup" | "inspect" | "setup",
  arg?: string
) {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...(arg ? [arg] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

interface Fixture {
  firstDate: string;
  pastDate: string;
  seriesId: string;
  splitId: string;
}

interface Inspection {
  later: { seriesId: string | null };
  past: { attendance: (string | null)[]; id: string } | null;
  series: { childrenAttended: number | null; recapReady: boolean };
  sessions: number;
  split: { recurring: boolean; seriesId: string | null };
}

test.describe("A series' first session and its saved sessions", () => {
  test.describe.configure({ mode: "serial" });
  let fx: Fixture;

  test.beforeAll(async ({ superAdminEmail }, testInfo) => {
    if (testInfo.project.name === "super_admin") {
      fx = await fixture<Fixture>("setup", superAdminEmail);
    }
  });
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });
  test.afterAll(async ({ browserName: _browserName }, testInfo) => {
    if (testInfo.project.name === "super_admin") {
      await fixture("cleanup");
    }
  });

  test("a link to the series' start date opens the series row and takes its recap", async ({
    page,
  }) => {
    await page.goto(`/events/${fx.seriesId}?occDate=${fx.firstDate}`);
    await waitForZeroReady(page);
    const recap = page.getByRole("region", { name: "Social recap" });
    await expect(recap.getByLabel("Children attended")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      recap.getByRole("button", { name: "Start recap" })
    ).toHaveCount(0);

    await recap.getByLabel("Children attended").fill("9");
    await recap.getByRole("button", { name: "Mark recap ready" }).click();
    await expect(recap.getByText(/Recap ready ·/)).toBeVisible({
      timeout: 10_000,
    });
    await expect
      .poll(
        async () => (await fixture<Inspection>("inspect", fx.pastDate)).series
      )
      .toEqual({ childrenAttended: 9, recapReady: true });
  });

  test("Mark attendance on an unsaved past session saves it and marks there", async ({
    page,
  }) => {
    await page.goto(`/events/${fx.seriesId}?occDate=${fx.pastDate}`);
    await waitForZeroReady(page);
    await page
      .getByRole("button", { exact: true, name: "Mark attendance" })
      .click({ timeout: 15_000 });
    await page.waitForURL(
      (url) =>
        url.pathname.startsWith("/events/") &&
        !url.pathname.endsWith(fx.seriesId),
      { timeout: 15_000 }
    );
    await page
      .getByRole("button", { name: /^Mark .+ present$/ })
      .first()
      .click({ timeout: 15_000 });

    await expect
      .poll(
        async () => (await fixture<Inspection>("inspect", fx.pastDate)).past
      )
      .toMatchObject({ attendance: ["present"] });
    const { past } = await fixture<Inspection>("inspect", fx.pastDate);
    expect(page.url()).toContain(`/events/${past?.id}`);
  });

  test("this and following makes the saved split session the new series and moves later ones", async ({
    page,
  }) => {
    await page.goto(`/events/${fx.splitId}`);
    await waitForZeroReady(page);
    await page.getByRole("button", { exact: true, name: "Edit" }).click({
      timeout: 15_000,
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "This and following events" })
      .click();
    const editDialog = page.getByRole("dialog");
    await expect(
      editDialog.getByRole("heading", { name: "Edit Event" })
    ).toBeVisible();
    await editDialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill("Series E2E class, new room");
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(editDialog).toBeHidden({ timeout: 10_000 });

    await expect
      .poll(async () => {
        const state = await fixture<Inspection>("inspect", fx.pastDate);
        return {
          later: state.later.seriesId,
          split: state.split,
        };
      })
      .toEqual({
        later: fx.splitId,
        split: { recurring: true, seriesId: null },
      });
  });
});
