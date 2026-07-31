import { expect, test } from "../../fixtures/test";

const REIMBURSEMENT_ATTACHMENT_ID = "e2e00000-0000-0000-0000-000000000005";
const TEMP_REIMBURSEMENT_ATTACHMENT_ID = "e2e00000-0000-0000-0000-000000000006";
const PENDING_EVENT_PHOTO_ID = "e2e00000-0000-0000-0000-000000000303";
const PRIVATE_EVENT_ID = "e2e00000-0000-4000-8000-000000000201";
const R2_KEY_PREFIX = process.env.R2_KEY_PREFIX ?? "attachments";
const EVENT_MEDIA_KEY = `${R2_KEY_PREFIX}/updates/${PRIVATE_EVENT_ID}/e2e-editor-image.jpg`;

const attachmentUrl = (baseURL: string | undefined, id: string) =>
  `${baseURL}/api/attachments/download?id=${id}&kind=reimbursementAttachment`;

const eventMediaUrl = (baseURL: string | undefined, key = EVENT_MEDIA_KEY) =>
  `${baseURL}/api/media/event-update?eventId=${PRIVATE_EVENT_ID}&key=${encodeURIComponent(key)}`;

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

  test("rejects unauthenticated avatar and editor media reads", async ({
    baseURL,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Run once");
    const avatar = await page.request.get(
      `${baseURL}/api/media/avatar/missing?key=${encodeURIComponent(`${R2_KEY_PREFIX}/avatars/missing/avatar.jpg`)}`,
      { headers: { Cookie: "" }, maxRedirects: 0 }
    );
    const editor = await page.request.get(eventMediaUrl(baseURL), {
      headers: { Cookie: "" },
      maxRedirects: 0,
    });

    expect(avatar.status()).toBe(401);
    expect(editor.status()).toBe(401);
  });

  test("redirects an authenticated user to their stored legacy avatar", async ({
    baseURL,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    const sessionResponse = await page.request.get(
      `${baseURL}/api/auth/get-session`
    );
    const session = (await sessionResponse.json()) as { user: { id: string } };
    const key = `${R2_KEY_PREFIX}/avatars/${session.user.id}/e2e-avatar.jpg`;
    const response = await page.request.get(
      `${baseURL}/api/media/avatar/${encodeURIComponent(session.user.id)}?key=${encodeURIComponent(key)}`,
      { maxRedirects: 0 }
    );

    expect(response.status()).toBe(302);
    expect(response.headers().location).toMatch(/^https:\/\//);
  });

  test("allows exact referenced editor media and rejects another key", async ({
    baseURL,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    const exact = await page.request.get(eventMediaUrl(baseURL), {
      maxRedirects: 0,
    });
    const unreferenced = await page.request.get(
      eventMediaUrl(
        baseURL,
        `${R2_KEY_PREFIX}/updates/${PRIVATE_EVENT_ID}/other.jpg`
      ),
      { maxRedirects: 0 }
    );

    expect(exact.status()).toBe(302);
    expect(unreferenced.status()).toBe(404);
  });

  test("denies editor media to a user who cannot view the private event", async ({
    baseURL,
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "unoriented_volunteer",
      "Unoriented-volunteer only"
    );
    const response = await page.request.get(eventMediaUrl(baseURL), {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(403);
  });
});
