import { expect, test } from "../../fixtures/test";

const REIMBURSEMENT_ATTACHMENT_ID = "e2e00000-0000-0000-0000-000000000005";
const TEMP_REIMBURSEMENT_ATTACHMENT_ID = "e2e00000-0000-0000-0000-000000000006";
const PENDING_EVENT_PHOTO_ID = "e2e00000-0000-0000-0000-000000000303";

const attachmentUrl = (baseURL: string | undefined, id: string) =>
  `${baseURL}/api/attachments/download?id=${id}&kind=reimbursementAttachment`;

test.describe("R2 object authorization", () => {
  test("rejects unauthenticated attachment downloads", async ({
    baseURL,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Run once");
    const response = await page.request.get(
      attachmentUrl(baseURL, REIMBURSEMENT_ATTACHMENT_ID),
      { headers: { Cookie: "" } }
    );
    expect(response.status()).toBe(401);
  });

  test("denies a volunteer access to another user's attachment", async ({
    baseURL,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    const response = await page.request.get(
      attachmentUrl(baseURL, REIMBURSEMENT_ATTACHMENT_ID)
    );
    expect(response.status()).toBe(403);
  });

  test("rejects an exact persisted temporary key", async ({
    baseURL,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin only");
    const response = await page.request.get(
      attachmentUrl(baseURL, TEMP_REIMBURSEMENT_ATTACHMENT_ID)
    );
    expect(response.status()).toBe(404);
  });

  test("redirects the uploader to signed pending event media", async ({
    baseURL,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    const response = await page.request.get(
      `${baseURL}/api/media/event-photo/${PENDING_EVENT_PHOTO_ID}`,
      { maxRedirects: 0 }
    );
    expect(response.status()).toBe(302);
    expect(response.headers().location).toMatch(/^https:\/\//);
  });

  test("denies unrelated users access to pending event media", async ({
    baseURL,
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "unoriented_volunteer",
      "Unoriented-volunteer only"
    );
    const response = await page.request.get(
      `${baseURL}/api/media/event-photo/${PENDING_EVENT_PHOTO_ID}`,
      { maxRedirects: 0 }
    );
    expect(response.status()).toBe(403);
  });
});
