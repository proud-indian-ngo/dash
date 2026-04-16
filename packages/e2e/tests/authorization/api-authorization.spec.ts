import { expect, test } from "../../fixtures/test";

/**
 * Tests that non-super_admin roles cannot call admin-only mutations via the
 * /api/zero/mutate endpoint. Uses the Zero push protocol format to send
 * custom mutations directly.
 */

function buildMutateBody(mutationName: string, args: Record<string, unknown>) {
  const suffix = `${mutationName.replace(".", "-")}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    clientGroupID: `e2e-authz-cg-${suffix}`,
    mutations: [
      {
        type: "custom" as const,
        id: 1,
        clientID: `e2e-authz-${suffix}`,
        name: mutationName,
        args: [args],
        timestamp: Date.now(),
      },
    ],
    pushVersion: 1,
    timestamp: Date.now(),
    requestID: `e2e-authz-req-${suffix}`,
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

  // Zero push protocol returns HTTP 200 even for rejected mutations.
  // The actual error is in the mutation result body, not the HTTP status.
  expect(response.ok()).toBe(true);
  const json = await response.json();
  expect(json.mutations).toBeDefined();
  expect(json.mutations[0].result.error).toBe("app");
  expect(json.mutations[0].result.message).toContain("Unauthorized");
}

const FAKE_ID = "00000000-0000-0000-0000-000000000000";

test.describe("API authorization — admin-only mutations rejected for volunteer", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
  });

  test("reimbursement.approve rejected for volunteer", async ({
    page,
    baseURL,
  }) => {
    await assertUnauthorized(page, baseURL, "reimbursement.approve", {
      id: FAKE_ID,
    });
  });

  test("team.create rejected for volunteer", async ({ page, baseURL }) => {
    await assertUnauthorized(page, baseURL, "team.create", {
      id: FAKE_ID,
      name: "E2E Unauthorized Team",
      description: "",
    });
  });

  test("expenseCategory.create rejected for volunteer", async ({
    page,
    baseURL,
  }) => {
    await assertUnauthorized(page, baseURL, "expenseCategory.create", {
      id: FAKE_ID,
      name: "E2E Unauthorized Category",
    });
  });

  test("whatsappGroup.create rejected for volunteer", async ({
    page,
    baseURL,
  }) => {
    await assertUnauthorized(page, baseURL, "whatsappGroup.create", {
      id: FAKE_ID,
      name: "E2E Unauthorized Group",
      jid: "fake-jid",
    });
  });

  test("appConfig.upsert rejected for volunteer", async ({ page, baseURL }) => {
    await assertUnauthorized(page, baseURL, "appConfig.upsert", {
      key: "e2e-test-key",
      value: "e2e-test-value",
    });
  });
});

test.describe("API authorization — admin role lacks finance + app config", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
  });

  test("reimbursement.approve rejected for admin (lacks requests.approve)", async ({
    page,
    baseURL,
  }) => {
    await assertUnauthorized(page, baseURL, "reimbursement.approve", {
      id: FAKE_ID,
    });
  });

  test("appConfig.upsert rejected for admin (lacks settings.app_config)", async ({
    page,
    baseURL,
  }) => {
    await assertUnauthorized(page, baseURL, "appConfig.upsert", {
      key: "e2e-test-key",
      value: "e2e-test-value",
    });
  });
});

test.describe("API authorization — finance_admin role lacks app config + whatsapp", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Finance-admin only");
  });

  test("appConfig.upsert rejected for finance_admin", async ({
    page,
    baseURL,
  }) => {
    await assertUnauthorized(page, baseURL, "appConfig.upsert", {
      key: "e2e-test-key",
      value: "e2e-test-value",
    });
  });

  test("whatsappGroup.create rejected for finance_admin", async ({
    page,
    baseURL,
  }) => {
    await assertUnauthorized(page, baseURL, "whatsappGroup.create", {
      id: FAKE_ID,
      name: "E2E Unauthorized Group",
      jid: "fake-jid",
    });
  });
});

test.describe("API authorization — unoriented_volunteer rejected from all writes", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "unoriented_volunteer",
      "Unoriented-volunteer only"
    );
  });

  test("reimbursement.approve rejected for unoriented_volunteer", async ({
    page,
    baseURL,
  }) => {
    await assertUnauthorized(page, baseURL, "reimbursement.approve", {
      id: FAKE_ID,
    });
  });

  test("team.create rejected for unoriented_volunteer", async ({
    page,
    baseURL,
  }) => {
    await assertUnauthorized(page, baseURL, "team.create", {
      id: FAKE_ID,
      name: "E2E Unauthorized Team",
      description: "",
    });
  });

  test("appConfig.upsert rejected for unoriented_volunteer", async ({
    page,
    baseURL,
  }) => {
    await assertUnauthorized(page, baseURL, "appConfig.upsert", {
      key: "e2e-test-key",
      value: "e2e-test-value",
    });
  });
});
