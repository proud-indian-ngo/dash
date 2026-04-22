import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { createPendingVP } from "../../helpers/vendor-payment";

/**
 * Tests status guards on vendor payment mutations.
 * submitInvoice requires status === "paid"; newly created VPs are "pending".
 */

function buildMutateBody(mutationName: string, args: Record<string, unknown>) {
  const suffix = `${mutationName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    clientGroupID: `e2e-vp-cg-${suffix}`,
    mutations: [
      {
        type: "custom" as const,
        id: 1,
        clientID: `e2e-vp-${suffix}`,
        name: mutationName,
        args: [args],
        timestamp: Date.now(),
      },
    ],
    pushVersion: 1,
    timestamp: Date.now(),
    requestID: `e2e-vp-req-${suffix}`,
  };
}

test.describe("Vendor payment unhappy paths (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("API: submitInvoice rejected on pending vendor payment", async ({
    page,
    baseURL,
  }) => {
    test.slow();
    const vpId = await createPendingVP(page);

    const body = buildMutateBody("vendorPayment.submitInvoice", {
      id: vpId,
      invoiceNumber: "INV-E2E-001",
      invoiceDate: Date.now(),
      attachments: [
        {
          id: `att-${Date.now()}`,
          type: "url",
          url: "https://example.com/invoice.pdf",
        },
      ],
    });

    const response = await page.request.post(
      `${baseURL}/api/zero/mutate?schema=zero_0&appID=zero`,
      { data: body }
    );
    expect(response.ok()).toBe(true);
    const json = await response.json();
    expect(json.mutations).toBeDefined();
    // Pending VP cannot have an invoice uploaded — status must be "paid"
    expect(json.mutations[0].result.error).toBe("app");
    expect(json.mutations[0].result.message).toMatch(/paid/i);
  });

  test("UI: Upload Invoice button not shown on pending vendor payment", async ({
    page,
  }) => {
    test.slow();
    const vpId = await createPendingVP(page);

    // Navigate to the VP detail page
    await page.goto(`/vendor-payments/${vpId}`);
    await waitForZeroReady(page);

    // Wait for page to load
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    // The "Upload Invoice" button should not be visible on a pending VP
    await expect(
      page.getByRole("button", { name: /Upload Invoice/i })
    ).toBeHidden({ timeout: 5000 });
  });
});
