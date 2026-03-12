import { expect, test } from "../../fixtures/test";

/**
 * Tests that volunteers cannot call admin-only mutations via the /api/zero/mutate endpoint.
 * Uses the Zero push protocol format to send custom mutations directly.
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

test.describe("API authorization — admin-only mutations rejected for volunteer", () => {
  // These tests run in the volunteer project only
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
  });

  test("reimbursement.approve rejected for volunteer", async ({
    page,
    baseURL,
  }) => {
    const body = buildMutateBody("reimbursement.approve", {
      id: "00000000-0000-0000-0000-000000000000",
    });

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
  });

  test("team.create rejected for volunteer", async ({ page, baseURL }) => {
    const body = buildMutateBody("team.create", {
      id: "00000000-0000-0000-0000-000000000000",
      name: "E2E Unauthorized Team",
      description: "",
    });

    const response = await page.request.post(
      `${baseURL}/api/zero/mutate?schema=zero_0&appID=zero`,
      { data: body }
    );

    expect(response.ok()).toBe(true);
    const json = await response.json();
    expect(json.mutations).toBeDefined();
    expect(json.mutations[0].result.error).toBe("app");
    expect(json.mutations[0].result.message).toContain("Unauthorized");
  });

  test("expenseCategory.create rejected for volunteer", async ({
    page,
    baseURL,
  }) => {
    const body = buildMutateBody("expenseCategory.create", {
      id: "00000000-0000-0000-0000-000000000000",
      name: "E2E Unauthorized Category",
    });

    const response = await page.request.post(
      `${baseURL}/api/zero/mutate?schema=zero_0&appID=zero`,
      { data: body }
    );

    expect(response.ok()).toBe(true);
    const json = await response.json();
    expect(json.mutations).toBeDefined();
    expect(json.mutations[0].result.error).toBe("app");
    expect(json.mutations[0].result.message).toContain("Unauthorized");
  });

  test("whatsappGroup.create rejected for volunteer", async ({
    page,
    baseURL,
  }) => {
    const body = buildMutateBody("whatsappGroup.create", {
      id: "00000000-0000-0000-0000-000000000000",
      name: "E2E Unauthorized Group",
      jid: "fake-jid",
    });

    const response = await page.request.post(
      `${baseURL}/api/zero/mutate?schema=zero_0&appID=zero`,
      { data: body }
    );

    expect(response.ok()).toBe(true);
    const json = await response.json();
    expect(json.mutations).toBeDefined();
    expect(json.mutations[0].result.error).toBe("app");
    expect(json.mutations[0].result.message).toContain("Unauthorized");
  });

  test("appConfig.upsert rejected for volunteer", async ({ page, baseURL }) => {
    const body = buildMutateBody("appConfig.upsert", {
      key: "e2e-test-key",
      value: "e2e-test-value",
    });

    const response = await page.request.post(
      `${baseURL}/api/zero/mutate?schema=zero_0&appID=zero`,
      { data: body }
    );

    expect(response.ok()).toBe(true);
    const json = await response.json();
    expect(json.mutations).toBeDefined();
    expect(json.mutations[0].result.error).toBe("app");
    expect(json.mutations[0].result.message).toContain("Unauthorized");
  });
});
