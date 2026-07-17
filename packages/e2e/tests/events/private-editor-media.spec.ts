import type { Page } from "@playwright/test";
import { expect, test, waitForZeroReady } from "../../fixtures/test";

const PRIVATE_EVENT_ID = "e2e00000-0000-4000-8000-000000000201";
const IMAGE_INPUT =
  'input[type="file"][accept="image/jpeg,image/png,image/gif,image/webp"]';
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

const mockR2 = async (page: Page) => {
  await page.route(/\.r2\.cloudflarestorage\.com\//, async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        headers: { "access-control-allow-origin": "*" },
        status: 200,
      });
      return;
    }
    await route.fulfill({ body: PNG, contentType: "image/png", status: 200 });
  });
};

const uploadImage = async (page: Page, name: string) => {
  await page.locator(IMAGE_INPUT).setInputFiles({
    buffer: PNG,
    mimeType: "image/png",
    name,
  });
  await expect(page.locator(`img[src*="${name}"]`)).toBeVisible();
};

const expectPersistedImage = async (page: Page, name: string) => {
  await expect(async () => {
    await page.reload();
    await waitForZeroReady(page);
    await expect(page.locator(`img[src*="${name}"]`)).toBeVisible({
      timeout: 2000,
    });
  }).toPass({ timeout: 20_000 });
};

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

  test("preserves image upload for event update authors", async ({
    page,
  }, testInfo) => {
    test.skip(
      !["super_admin", "volunteer"].includes(testInfo.project.name),
      "Relevant permission roles only"
    );
    await page.goto(`/events/${PRIVATE_EVENT_ID}?tab=updates`);
    await waitForZeroReady(page);

    const imageInput = page.locator(IMAGE_INPUT);
    await expect(imageInput).toHaveCount(1);
  });

  test("uploads and persists an image in a volunteer event update", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await mockR2(page);
    await page.goto(`/events/${PRIVATE_EVENT_ID}?tab=updates`);
    await waitForZeroReady(page);

    const name = "e2e-volunteer-update.png";
    await uploadImage(page, name);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Update submitted for approval")).toBeVisible();

    await expectPersistedImage(page, name);
  });

  test("uploads and persists an image in participant feedback", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await mockR2(page);
    await page.goto(`/events/${PRIVATE_EVENT_ID}?tab=feedback`);
    await waitForZeroReady(page);

    const editButton = page.getByRole("button", { name: "Edit" });
    await expect(page.locator(IMAGE_INPUT).or(editButton)).toHaveCount(1);
    const isEditingExistingFeedback = await editButton.isVisible();
    if (isEditingExistingFeedback) {
      await editButton.click();
    }

    const name = "e2e-volunteer-feedback.png";
    await uploadImage(page, name);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText(
        isEditingExistingFeedback ? "Feedback updated" : "Feedback submitted"
      )
    ).toBeVisible();

    await expectPersistedImage(page, name);
  });
});
