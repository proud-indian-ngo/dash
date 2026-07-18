import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "../../fixtures/test";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-public-schedule.ts"
);

async function fixture<T>(action: string, argument?: string): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...(argument ? [argument] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

test.describe("Kalakriti public schedule", () => {
  test.describe.configure({ mode: "serial" });

  test("publishes the privacy-filtered schedule without authentication", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "kalakriti_release_invariants",
      "Unauthenticated public schedule workflow"
    );
    const { draftYear, year } = await fixture<{
      draftYear: number;
      year: number;
    }>("setup");

    try {
      const apiResponse = await request.get(`/api/kalakriti/${year}/schedule`);
      expect(apiResponse.status()).toBe(200);
      expect(apiResponse.headers()["cache-control"]).toBe(
        "public, max-age=0, must-revalidate"
      );
      const body = await apiResponse.json();
      expect(Object.keys(body.edition).sort()).toEqual([
        "eventDate",
        "name",
        "timezone",
        "year",
      ]);
      expect(Object.keys(body.sessions[0]).sort()).toEqual([
        "ageCategory",
        "competition",
        "endAt",
        "startAt",
        "status",
        "venue",
      ]);
      expect(JSON.stringify(body)).not.toContain("capacity");
      expect(
        body.sessions.map(
          (session: { competition: string }) => session.competition
        )
      ).toEqual(["Drawing", "Painting"]);
      expect(body.sessions[1].status).toBe("cancelled");

      await page.goto(`/kalakriti/${year}/schedule`);
      await expect(page).toHaveURL(`/kalakriti/${year}/schedule`);
      await expect(
        page.getByRole("heading", { level: 1, name: `Kalakriti ${year}` })
      ).toBeVisible();
      await expect(page.getByText("Drawing", { exact: true })).toBeVisible();
      await expect(page.getByText("Painting", { exact: true })).toBeVisible();
      await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
      await expect(page.getByText("Art Room", { exact: false })).toHaveCount(2);

      await fixture("update-venue");
      const updatedResponse = await request.get(
        `/api/kalakriti/${year}/schedule`
      );
      expect((await updatedResponse.json()).sessions[0].venue).toBe(
        "Updated Hall"
      );
      await page.reload();
      await expect(
        page.getByText("Updated Hall", { exact: false })
      ).toHaveCount(2);

      expect(
        (await request.get(`/api/kalakriti/${draftYear}/schedule`)).status()
      ).toBe(404);
      expect((await request.get("/api/kalakriti/2189/schedule")).status()).toBe(
        404
      );

      await fixture("set-lifecycle", "registration_locked");
      const lockedSchedule = await request.get(
        `/api/kalakriti/${year}/schedule`
      );
      expect(lockedSchedule.status()).toBe(200);
      expect(Object.keys((await lockedSchedule.json()).edition).sort()).toEqual(
        ["eventDate", "name", "timezone", "year"]
      );

      await fixture("set-lifecycle", "live");
      const liveSchedule = await request.get(`/api/kalakriti/${year}/schedule`);
      expect(liveSchedule.status()).toBe(200);
      expect(Object.keys((await liveSchedule.json()).edition).sort()).toEqual([
        "eventDate",
        "name",
        "timezone",
        "year",
      ]);

      await fixture("set-lifecycle", "archived");
      const archivedSchedule = await request.get(
        `/api/kalakriti/${year}/schedule`
      );
      expect(archivedSchedule.status()).toBe(200);
      expect(
        Object.keys((await archivedSchedule.json()).edition).sort()
      ).toEqual(["eventDate", "name", "timezone", "year"]);
    } finally {
      await fixture("cleanup");
    }
  });
});
