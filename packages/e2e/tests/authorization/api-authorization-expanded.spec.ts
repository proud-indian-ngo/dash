import { expect, test } from "../../fixtures/test";

/**
 * Expanded API authorization tests verifying additional admin-only mutations
 * are rejected for volunteers via the Zero push protocol.
 *
 * Complements api-authorization.spec.ts (which tests 5 mutations).
 * Uses the same buildMutateBody pattern — volunteers only.
 */

function buildMutateBody(mutationName: string, args: Record<string, unknown>) {
  const suffix = `${mutationName.replace(".", "-")}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    clientGroupID: `e2e-authz2-cg-${suffix}`,
    mutations: [
      {
        type: "custom" as const,
        id: 1,
        clientID: `e2e-authz2-${suffix}`,
        name: mutationName,
        args: [args],
        timestamp: Date.now(),
      },
    ],
    pushVersion: 1,
    timestamp: Date.now(),
    requestID: `e2e-authz2-req-${suffix}`,
  };
}

async function assertUnauthorized(
  page: import("@playwright/test").Page,
  baseURL: string | undefined,
  mutationName: string,
  args: Record<string, unknown>
) {
  const body = buildMutateBody(mutationName, args);
  const response = await page.request.post(
    `${baseURL}/api/zero/mutate?schema=zero_0&appID=zero`,
    { data: body }
  );
  expect(response.ok()).toBe(true);
  const json = await response.json();
  expect(json.mutations).toBeDefined();
  expect(json.mutations[0].result.error).toBe("app");
  expect(json.mutations[0].result.message).toContain("Unauthorized");
}

const FAKE_ID = "00000000-0000-0000-0000-000000000000";

test.describe("API authorization — expanded mutations rejected for volunteer", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
  });

  // ── Vendor ──────────────────────────────────────────────────────────────────

  test("vendor.approve rejected for volunteer", async ({ page, baseURL }) => {
    await assertUnauthorized(page, baseURL, "vendor.approve", { id: FAKE_ID });
  });

  test("vendor.delete rejected for volunteer", async ({ page, baseURL }) => {
    await assertUnauthorized(page, baseURL, "vendor.delete", { id: FAKE_ID });
  });

  // ── Vendor Payment ───────────────────────────────────────────────────────────

  test("vendorPayment.approve rejected for volunteer", async ({
    page,
    baseURL,
  }) => {
    await assertUnauthorized(page, baseURL, "vendorPayment.approve", {
      id: FAKE_ID,
    });
  });

  test("vendorPayment.reject rejected for volunteer", async ({
    page,
    baseURL,
  }) => {
    await assertUnauthorized(page, baseURL, "vendorPayment.reject", {
      id: FAKE_ID,
      reason: "test",
    });
  });

  // ── Team ────────────────────────────────────────────────────────────────────

  test("team.update rejected for volunteer", async ({ page, baseURL }) => {
    await assertUnauthorized(page, baseURL, "team.update", {
      id: FAKE_ID,
      name: "Test Team",
      now: Date.now(),
    });
  });

  test("team.delete rejected for volunteer", async ({ page, baseURL }) => {
    await assertUnauthorized(page, baseURL, "team.delete", { id: FAKE_ID });
  });

  test("team.addMember rejected for volunteer", async ({ page, baseURL }) => {
    // assertIsLoggedIn passes (volunteer is logged in),
    // but isTeamLead will be false for fake teamId,
    // so assertHasPermissionOrTeamLead("teams.manage_members", false) → Unauthorized
    await assertUnauthorized(page, baseURL, "team.addMember", {
      id: FAKE_ID,
      teamId: FAKE_ID,
      userId: FAKE_ID,
      role: "member",
    });
  });

  test("team.removeMember rejected for volunteer", async ({
    page,
    baseURL,
  }) => {
    await assertUnauthorized(page, baseURL, "team.removeMember", {
      teamId: FAKE_ID,
      memberId: FAKE_ID,
    });
  });

  // ── Scheduled Messages ───────────────────────────────────────────────────────

  test("scheduledMessage.create rejected for volunteer", async ({
    page,
    baseURL,
  }) => {
    await assertUnauthorized(page, baseURL, "scheduledMessage.create", {
      id: FAKE_ID,
      message: "Test message",
      recipients: [{ id: FAKE_ID, label: "Test Group", type: "group" }],
      scheduledAt: Date.now() + 60_000,
    });
  });

  test("scheduledMessage.delete rejected for volunteer", async ({
    page,
    baseURL,
  }) => {
    await assertUnauthorized(page, baseURL, "scheduledMessage.delete", {
      id: FAKE_ID,
    });
  });

  // ── Notification Preferences (admin) ────────────────────────────────────────

  test("notificationPreference.adminUpsert rejected for volunteer", async ({
    page,
    baseURL,
  }) => {
    await assertUnauthorized(
      page,
      baseURL,
      "notificationPreference.adminUpsert",
      {
        topicId: "test-topic",
        channel: "email",
        enabled: true,
        userId: FAKE_ID,
      }
    );
  });
});
