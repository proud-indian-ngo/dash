import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/social-recap.ts"
);

async function fixture<T>(
  action: "cleanup" | "inspect" | "setup",
  argument?: string
) {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...(argument ? [argument] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

interface SocialEvent {
  attendance: { children: number; hours: number; volunteers: number } | null;
  id: string;
  photos: { count: number | null };
  socialNotes: string | null;
  status: string;
  volunteers: { needed: number };
}

test.describe("Social recap", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "volunteer",
      "The seeded volunteer is this fixture's team lead"
    );
  });

  test("a team lead marks the recap ready and the social API reports it", async ({
    page,
    request,
    volunteerEmail,
  }) => {
    test.slow();
    const fx = await fixture<{
      eventId: string;
      from: string;
      photoId: string;
      to: string;
      token: string;
      usablePhotoId: string;
    }>("setup", volunteerEmail);

    try {
      await page.goto(`/events/${fx.eventId}`);
      await waitForZeroReady(page);

      const recap = page.getByRole("region", { name: "Social recap" });
      await expect(recap).toBeVisible({ timeout: 15_000 });
      await expect(recap.getByTestId("recap-volunteers")).toHaveText("1");

      await recap.getByLabel("Children attended").fill("17");
      await recap
        .getByLabel("What happened")
        .fill("Built paper boats and raced them");
      const paperBoats = recap
        .getByRole("listitem")
        .filter({ hasText: "Paper boats" })
        .getByRole("switch", { name: "Do not use" });
      await paperBoats.click();
      await expect(paperBoats).toBeChecked();

      await recap.getByRole("button", { name: "Mark recap ready" }).click();
      await expect(recap.getByText(/Recap ready ·/)).toBeVisible({
        timeout: 10_000,
      });
      await expect(recap.getByRole("button", { name: "Edit" })).toBeVisible();
      await expect(recap.getByRole("button", { name: "Undo" })).toBeVisible();

      await expect
        .poll(
          async () =>
            (await fixture<{ photoDoNotUse: boolean | null }>("inspect"))
              .photoDoNotUse
        )
        .toBe(true);

      const response = await request.get(
        `/api/social/v1/events?from=${fx.from}&to=${fx.to}`,
        { headers: { Authorization: `Bearer ${fx.token}` } }
      );
      expect(response.status()).toBe(200);
      const body = (await response.json()) as { events: SocialEvent[] };
      const event = body.events.find((e) => e.id === fx.eventId);
      // Only the usable image counts: not the do-not-use one, not the video.
      expect(event).toMatchObject({
        attendance: { children: 17, hours: 2, volunteers: 1 },
        photos: { count: 1 },
        socialNotes: "Built paper boats and raced them",
        status: "completed",
        volunteers: { needed: 6 },
      });

      const photosResponse = await request.get(
        `/api/social/v1/events/${fx.eventId}/photos`,
        { headers: { Authorization: `Bearer ${fx.token}` } }
      );
      expect(photosResponse.status()).toBe(200);
      const { photos } = (await photosResponse.json()) as {
        photos: { doNotUse: boolean; id: string }[];
      };
      // Usable first, the do-not-use image flagged after it, no video.
      expect(photos.map((p) => [p.id, p.doNotUse])).toEqual([
        [fx.usablePhotoId, false],
        [fx.photoId, true],
      ]);
    } finally {
      await fixture("cleanup");
    }
  });
});
