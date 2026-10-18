import { expect, test } from "../../fixtures/test";

const PENDING_PHOTO_ID = "e2e00000-0000-0000-0000-000000000303";
const PENDING_ASSET_ID = "a2e00000-0000-0000-0000-000000000303";
const APPROVED_PHOTO_ID = "e2e00000-0000-0000-0000-000000000308";
const UNREFERENCED_ASSET_ID = "a2e00000-0000-0000-0000-000000000308";
const ROUTES = ["original", "thumbnail"] as const;

const immichUrl = (
  baseURL: string | undefined,
  route: (typeof ROUTES)[number],
  id: string
) => `${baseURL}/api/immich/${route}/${id}`;

test.describe("Immich event photo authorization", () => {
  for (const route of ROUTES) {
    test(`${route} rejects a caller-supplied raw asset id`, async ({
      baseURL,
      request,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

      const response = await request.get(
        immichUrl(baseURL, route, UNREFERENCED_ASSET_ID)
      );
      expect(response.status()).toBe(404);
    });

    test(`${route} denies another user's pending photo`, async ({
      baseURL,
      request,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== "unoriented_volunteer",
        "Unoriented-volunteer only"
      );

      const response = await request.get(
        immichUrl(baseURL, route, PENDING_PHOTO_ID)
      );
      expect(response.status()).toBe(403);
    });

    test(`${route} resolves an accessible approved photo row`, async ({
      baseURL,
      request,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

      const response = await request.get(
        immichUrl(baseURL, route, APPROVED_PHOTO_ID)
      );
      expect(response.status()).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: "Photo not found",
      });
    });

    test(`${route} never treats another raw asset id as a photo row`, async ({
      baseURL,
      request,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

      const response = await request.get(
        immichUrl(baseURL, route, PENDING_ASSET_ID)
      );
      expect(response.status()).toBe(404);
    });
  }
});
