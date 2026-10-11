import { expect, test } from "../../fixtures/test";
import { openPublicEvent } from "../../helpers/team-event";

/**
 * Tests API-level guards on eventInterest mutations for volunteers.
 * We cannot easily test "already a member" via UI (requires a team setup),
 * so we use the Zero mutate endpoint directly.
 */

function buildMutateBody(mutationName: string, args: Record<string, unknown>) {
  const suffix = `${mutationName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    clientGroupID: `e2e-interest-cg-${suffix}`,
    mutations: [
      {
        args: [args],
        clientID: `e2e-interest-${suffix}`,
        id: 1,
        name: mutationName,
        timestamp: Date.now(),
        type: "custom" as const,
      },
    ],
    pushVersion: 1,
    requestID: `e2e-interest-req-${suffix}`,
    timestamp: Date.now(),
  };
}

const FAKE_ID = "00000000-0000-0000-0000-000000000000";

test.describe("Event interest unhappy paths (volunteer)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
  });

  test("cannot express interest in a non-existent event", async ({
    page,
    baseURL,
  }) => {
    // With a fake eventId, the mutator should find no event and throw
    const body = buildMutateBody("eventInterest.create", {
      eventId: FAKE_ID,
      id: FAKE_ID,
      message: "I'm interested!",
      now: Date.now(),
    });

    const response = await page.request.post(
      `${baseURL}/api/zero/mutate?schema=zero_0&appID=zero`,
      { data: body }
    );
    expect(response.ok()).toBe(true);
    const json = await response.json();
    expect(json.mutations).toBeDefined();
    // Fake eventId: should fail with app error (event not found, or not public, etc.)
    expect(json.mutations[0].result.error).toBe("app");
  });

  test("express interest UI — show interest button visible on public events for volunteers", async ({
    page,
  }) => {
    // Regression check: a public event outside the volunteer's teams offers
    // Show Interest on its page.
    await openPublicEvent(page, "E2E Open Interest Event");
    await expect(
      page.getByRole("button", { exact: true, name: "Show Interest" })
    ).toBeVisible();
  });
});
