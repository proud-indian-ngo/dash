import { expect, test, waitForZeroReady } from "../../fixtures/test";

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

/** Create a VP via UI and return its ID from the URL. */
async function createPendingVP(
  page: import("@playwright/test").Page
): Promise<string> {
  await page.goto("/vendor-payments/new");
  await waitForZeroReady(page);
  await expect(
    page.getByRole("heading", { name: "New Vendor Payment" })
  ).toBeVisible();

  const title = `E2E VP Unhappy ${Date.now()}`;
  await page.getByLabel("Title").fill(title);

  // Select first available vendor
  const vendorTrigger = page.getByRole("combobox", { name: "Vendor" });
  await vendorTrigger.click();
  const firstOption = page.getByRole("option").first();
  const hasOptions = await firstOption
    .isVisible({ timeout: 10_000 })
    .catch(() => false);

  if (hasOptions) {
    await firstOption.click();
  } else {
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Add new vendor" }).click();
    const dialog = page.getByRole("dialog", { name: /vendor/i });
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog
      .getByRole("textbox", { name: "Name", exact: true })
      .fill(`E2E Vendor ${Date.now()}`);
    await dialog
      .getByRole("textbox", { name: "Phone", exact: true })
      .fill("+91-9876543210");
    await dialog
      .getByRole("textbox", { name: "Bank Account Name" })
      .fill("VP Unhappy Account");
    await dialog
      .getByRole("textbox", { name: "Account Number" })
      .fill("9999000001");
    await dialog
      .getByRole("textbox", { name: "IFSC Code" })
      .fill("SBIN0001234");
    await dialog.getByRole("button", { name: /Create/i }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await page.getByRole("combobox", { name: "Vendor" }).click();
    await expect(firstOption).toBeVisible({ timeout: 10_000 });
    await firstOption.click();
  }

  // Fill line item
  await page
    .getByRole("combobox", { name: "Category for line item 1" })
    .click();
  await page.getByRole("option").first().click();
  await page.waitForTimeout(300);
  await page
    .getByLabel("Description for line item 1")
    .fill("Unhappy path test item");
  await page.getByLabel("Amount for line item 1").fill("1000");

  await page.getByRole("button", { name: "Submit" }).click();
  // Require UUID pattern (8+ hex chars + dash) to exclude /vendor-payments/new
  await page.waitForURL(/\/vendor-payments\/[0-9a-f]{8}-/, { timeout: 15_000 });

  const url = page.url();
  const id = url.split("/vendor-payments/")[1];
  return id;
}

test.describe("Vendor payment unhappy paths (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
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
