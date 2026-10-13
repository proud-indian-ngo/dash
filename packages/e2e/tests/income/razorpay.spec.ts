import { createHmac } from "node:crypto";

import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

/**
 * Razorpay Payment Page ingestion end to end: signed webhooks in, donors and
 * contributions out. run-e2e.sh sets a test key id and webhook secret and no
 * key secret, so the job uses the signed webhook copy and never calls
 * Razorpay.
 */

const SECRET =
  process.env.RAZORPAY_WEBHOOK_SECRET ?? "e2e-razorpay-webhook-secret";
const WEBHOOK = "/api/razorpay/webhook";
const CLEARING = "E2E Razorpay Clearing";

/** A PAN unique to this run: five letters, four digits, one letter. */
function runPan(run: string): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const pick = (n: number) => letters[n % 26] ?? "A";
  const seed = Number(run.slice(-9));
  return `${pick(seed >> 1)}${pick(seed >> 4)}${pick(seed >> 7)}${pick(seed >> 10)}R${run.slice(-4).padStart(4, "0")}${pick(seed >> 13)}`;
}

function capturedEvent(
  event: "order.paid" | "payment.captured",
  payment: {
    amount: number;
    email: string;
    id: string;
    notes: Record<string, string>;
  }
) {
  return JSON.stringify({
    account_id: "acc_E2E",
    contains: ["payment"],
    created_at: Math.floor(Date.now() / 1000),
    entity: "event",
    event,
    payload: {
      payment: {
        entity: {
          ...payment,
          captured: true,
          contact: "+919800000000",
          created_at: Math.floor(Date.now() / 1000),
          currency: "INR",
          entity: "payment",
          fee: Math.round(payment.amount * 0.0236),
          method: "upi",
          status: "captured",
          tax: Math.round(payment.amount * 0.0036),
        },
      },
    },
  });
}

const sign = (body: string, secret = SECRET) =>
  createHmac("sha256", secret).update(body).digest("hex");

async function post(
  request: APIRequestContext,
  body: string,
  signature: string | null = sign(body)
) {
  return await request.post(WEBHOOK, {
    // A Buffer goes as is; Playwright would re-encode a string that is not JSON.
    data: Buffer.from(body, "utf8"),
    headers: {
      "content-type": "application/json",
      ...(signature ? { "x-razorpay-signature": signature } : {}),
      "x-razorpay-event-id": `evt_${Date.now()}`,
    },
  });
}

async function contributionRows(page: Page, donor: string) {
  await page.goto("/income");
  await waitForZeroReady(page);
  await page.getByPlaceholder("Search donor or reference...").fill(donor);
  return page.getByRole("row").filter({ hasText: donor });
}

test.describe("Income: Razorpay Payment Page", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("refuses unsigned, wrongly signed and unreadable deliveries", async ({
    request,
  }) => {
    const body = capturedEvent("payment.captured", {
      amount: 10_000,
      email: "unsigned@example.test",
      id: `pay_E2EUnsigned${Date.now()}`,
      notes: { name: "Never Recorded" },
    });
    expect((await post(request, body, null)).status()).toBe(401);
    expect(
      (await post(request, body, sign(body, "wrong-secret"))).status()
    ).toBe(401);
    expect((await post(request, `${body} `, sign(body))).status()).toBe(401);
    expect((await post(request, "{not json")).status()).toBe(400);
    const refund = JSON.stringify({ event: "refund.processed", payload: {} });
    expect((await post(request, refund)).status()).toBe(200);
  });

  test("records a donation once, and holds a contact-only match for review", async ({
    page,
    request,
  }) => {
    test.slow();
    const run = String(Date.now());
    const donor = `E2E Razorpay Donor ${run}`;
    const email = `rzp-${run}@example.test`;

    // Settings → Integrations: connected in test mode; choose the clearing account.
    await page.goto("/settings/integrations");
    await waitForZeroReady(page);
    await expect(page.getByTestId("razorpay-status")).toHaveText(
      "Connected · test mode"
    );
    await expect(page.getByLabel("Webhook URL")).toHaveValue(
      /\/api\/razorpay\/webhook$/
    );
    const account = page.getByRole("combobox", {
      name: "Razorpay clearing account",
    });
    await account.click();
    await account.fill(CLEARING);
    await page
      .getByRole("option")
      .filter({ hasText: CLEARING })
      .first()
      .click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Razorpay settings saved")).toBeVisible();

    // A new donor with a PAN: imported at once, as a new donor.
    const first = capturedEvent("payment.captured", {
      amount: 50_000,
      email,
      id: `pay_E2E${run}`,
      notes: { "Full Name": donor, "PAN Number": runPan(run) },
    });
    expect((await post(request, first)).status()).toBe(200);
    await expect(await contributionRows(page, donor)).toHaveCount(1, {
      timeout: 30_000,
    });
    await expect(await contributionRows(page, donor)).toContainText("₹500.00");

    // Redelivered, and announced again as order.paid: still one contribution.
    expect((await post(request, first)).status()).toBe(200);
    const asOrder = first.replace('"payment.captured"', '"order.paid"');
    expect((await post(request, asOrder)).status()).toBe(200);

    // Same email, no PAN: proposed as that donor, so it waits for review.
    const second = capturedEvent("payment.captured", {
      amount: 75_000,
      email,
      id: `pay_E2E${run}b`,
      notes: { name: `E2E Razorpay Second ${run}` },
    });
    expect((await post(request, second)).status()).toBe(200);

    await page.goto("/income?tab=imports");
    await waitForZeroReady(page);
    await expect(page.getByTestId("imports-needs-review")).toContainText(
      /Needs review: \d+/,
      { timeout: 30_000 }
    );
    // The redeliveries were processed before the later payment: one gift only.
    await expect(await contributionRows(page, donor)).toHaveCount(1);

    await page.goto("/income?tab=imports");
    await waitForZeroReady(page);
    const batch = page
      .getByRole("row")
      .filter({ hasText: /Razorpay payments, .* \(test mode\)/ })
      .first();
    await batch.click();
    await page.getByRole("button", { name: /^Review \d+ payments?$/ }).click();
    const waiting = page
      .getByRole("row")
      .filter({ hasText: `E2E Razorpay Second ${run}` });
    await waiting.getByRole("combobox", { name: /Donor for row/ }).click();
    await page.getByRole("option").filter({ hasText: donor }).first().click();
    await page.getByRole("button", { name: "Import 1 contribution" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Import" })
      .click();
    await expect(page.getByTestId("import-result")).toContainText(
      "1 contribution imported"
    );

    // Both gifts now belong to the first donor; no second donor was made.
    await expect(await contributionRows(page, donor)).toHaveCount(2, {
      timeout: 15_000,
    });
    await page.goto("/donors");
    await waitForZeroReady(page);
    await page
      .getByPlaceholder(/Search/)
      .first()
      .fill(`E2E Razorpay Second ${run}`);
    await expect(
      page.getByRole("row").filter({ hasText: `E2E Razorpay Second ${run}` })
    ).toHaveCount(0);
  });
});
