import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { clickPageAction } from "../../helpers/page-header";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/series-first-session.ts"
);

async function fixture<T>(
  action: "cleanup" | "inspect" | "record" | "setup",
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
  splitStart: number;
  pastDate: string;
  seriesId: string;
  splitId: string;
}

interface Inspection {
  cancelled: { later: boolean; past: boolean; series: boolean; split: boolean };
  later: { seriesId: string | null };
  newSeries: { id: string; members: number } | null;
  oldRule: string | null;
  past: { attendance: (string | null)[]; id: string } | null;
  series: { childrenAttended: number | null; recapReady: boolean };
  seriesRows: number;
  split: { members: number; seriesId: string | null; startTime: number | null };
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
    expect(state.split).toEqual({
      members: 1,
      seriesId: newSeriesId,
      startTime: fx.splitStart,
    });
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

    // On the new series' start date "this and following" is every session,
    // so only "This event" and "All events" are offered.
    await page.getByRole("button", { exact: true, name: "Edit" }).click({
      timeout: 15_000,
    });
    const scopeDialog = page.getByRole("dialog");
    await expect(
      scopeDialog.getByRole("button", { name: "All events in the series" })
    ).toBeVisible();
    await expect(
      scopeDialog.getByRole("button", { name: "This and following events" })
    ).toHaveCount(0);

    // All events from there moves the series an hour later, and the
    // start-date row, its first session, moves with it.
    await scopeDialog
      .getByRole("button", { name: "All events in the series" })
      .click();
    const allDialog = page.getByRole("dialog", { name: "Edit event" });
    await expect(
      allDialog.getByRole("heading", { name: "Edit Event" })
    ).toBeVisible();
    await allDialog
      .getByRole("button", { exact: true, name: "Start time" })
      .click();
    const picker = page.getByRole("dialog").last();
    const nextHour = (new Date(fx.splitStart).getHours() + 1) % 12 || 12;
    await picker
      .getByRole("button", { exact: true, name: String(nextHour) })
      .first()
      .click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await allDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(allDialog).toBeHidden({ timeout: 10_000 });
    await expect
      .poll(
        async () =>
          (await fixture<Inspection>("inspect", fx.pastDate)).split.startTime
      )
      .toBe(fx.splitStart + 60 * 60 * 1000);
  });

  test("All upcoming events cancels the sessions ahead and keeps the ones held", async ({
    page,
    superAdminEmail,
  }) => {
    // A fresh series whose first session has a recap and whose second is
    // saved with attendance; two upcoming sessions are saved.
    fx = await fixture<Fixture>("setup", superAdminEmail);
    await fixture("record");

    await page.goto(`/events/${fx.splitId}`);
    await waitForZeroReady(page);
    await clickPageAction(page, "Cancel event");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "All upcoming events" })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel event" })
      .click();
    await page.waitForURL("**/teams/**", { timeout: 15_000 });

    await expect
      .poll(
        async () =>
          (await fixture<Inspection>("inspect", fx.pastDate)).cancelled
      )
      .toEqual({ later: true, past: false, series: false, split: true });
    const state = await fixture<Inspection>("inspect", fx.pastDate);
    expect(state.series).toEqual({ childrenAttended: 9, recapReady: true });
    expect(state.past?.attendance).toEqual(["present"]);
    // The series ends after its last started session, before the split day.
    const until = /UNTIL=(\d{8})T235959Z$/.exec(state.oldRule ?? "")?.[1];
    expect(until && until < fx.splitDate.replaceAll("-", "")).toBe(true);

    // The series page still shows the held first session, not a cancellation.
    await page.goto(`/events/${fx.seriesId}`);
    await waitForZeroReady(page);
    await expect(
      page
        .getByRole("region", { name: "Social recap" })
        .getByText(/Recap ready ·/)
    ).toBeVisible({ timeout: 15_000 });
  });
});
