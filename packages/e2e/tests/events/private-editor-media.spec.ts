import { expect, test, waitForZeroReady } from "../../fixtures/test";

const PRIVATE_EVENT_ID = "e2e00000-0000-0000-0000-000000000201";

test.describe("Private editor media", () => {
  test("renders legacy editor images through the authenticated media route", async ({
    page,
  }, testInfo) => {
    test.skip(
      !["super_admin", "volunteer"].includes(testInfo.project.name),
      "Event viewers only"
    );
    await page.goto(`/events/${PRIVATE_EVENT_ID}?tab=updates`);
    await waitForZeroReady(page);

    await expect(
      page.locator('img[src^="/api/media/event-update?"]').first()
    ).toHaveAttribute("src", /eventId=.*&key=/);
  });

  test("shows image upload only to users with strict update permission", async ({
    page,
  }, testInfo) => {
    test.skip(
      !["super_admin", "volunteer"].includes(testInfo.project.name),
      "Relevant permission roles only"
    );
    await page.goto(`/events/${PRIVATE_EVENT_ID}?tab=updates`);
    await waitForZeroReady(page);

    const imageInput = page.locator(
      'input[type="file"][accept="image/jpeg,image/png,image/gif,image/webp"]'
    );
    if (testInfo.project.name === "super_admin") {
      await expect(imageInput).toHaveCount(1);
    } else {
      await expect(imageInput).toHaveCount(0);
    }
  });
});
