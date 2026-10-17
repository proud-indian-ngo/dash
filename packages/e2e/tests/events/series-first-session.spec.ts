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
  splitDate: string;
  pastDate: string;
  seriesId: string;
  splitId: string;
}

interface Inspection {
  later: { seriesId: string | null };
  newSeries: { id: string; members: number } | null;
  oldRule: string | null;
  past: { attendance: (string | null)[]; id: string } | null;
  series: { childrenAttended: number | null; recapReady: boolean };
  seriesRows: number;
  split: { members: number; seriesId: string | null };
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

  test("this and following starts a new series and moves the saved sessions from the split day on", async ({
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
      .poll(
        async () =>
          (await fixture<Inspection>("inspect", fx.pastDate)).newSeries
      )
      .not.toBeNull();
    const state = await fixture<Inspection>("inspect", fx.pastDate);
    // One new series row, nothing else promoted to a series.
    expect(state.seriesRows).toBe(2);
    const [year, month, day] = fx.splitDate.split("-").map(Number);
    const dayBefore = new Date(
      Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) - 1)
    )
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", "");
    expect(state.oldRule).toBe(`FREQ=WEEKLY;UNTIL=${dayBefore}T235959Z`);
    // The split day's row and the one after moved; its volunteer stayed on it.
    const newSeriesId = state.newSeries?.id;
    expect(state.split).toEqual({ members: 1, seriesId: newSeriesId });
    expect(state.later.seriesId).toBe(newSeriesId);
    expect(state.newSeries?.members).toBe(0);

    // The new series' page points to its first session, the moved row.
    await page.goto(`/events/${newSeriesId}`);
    await waitForZeroReady(page);
    await page
      .getByRole("region", { name: "First session" })
      .getByRole("link", { name: "Open this session" })
      .click({ timeout: 15_000 });
    await page.waitForURL(`**/events/${fx.splitId}`, { timeout: 15_000 });
  });
});
