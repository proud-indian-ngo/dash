import { execFile } from "node:child_process";
import { createHmac } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";

import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const execFileAsync = promisify(execFile);

/** Runs a database read in helpers/razorpay.ts under Bun. */
async function fixture<T>(action: string, arg = ""): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(import.meta.dirname, "../../helpers/razorpay.ts"),
      action,
      arg,
    ],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

const paymentRows = (paymentId: string) =>
  fixture<{ outcome: string; reason: string | null }[]>("rows", paymentId);
const paymentContributions = (paymentId: string) =>
  fixture<number>("contributions", paymentId);
const syncJobsSettled = (paymentId: string) =>
  fixture<boolean>("settled", paymentId);
const paymentRefunds = (paymentId: string) =>
  fixture<{
    refunds: { amountPaise: number; reference: string | null }[];
    status: string | null;
  }>("refunds", paymentId);
const refundJobsSettled = (refundId: string) =>
  fixture<boolean>("refund-settled", refundId);
const pendingRefunds = (paymentId: string) =>
  fixture<number>("pending-refunds", paymentId);

/**
 * Razorpay Payment Page ingestion end to end: signed webhooks in, donors and
 * contributions out. run-e2e.sh sets a test key id and webhook secret and no
 * key secret, so the job uses the signed webhook copy and never calls
 * Razorpay. Everything a run creates carries the run's ID (payment IDs,
 * email, phone, names), and outcomes are read from the database, so a retry
 * never trips over an earlier attempt's rows. The global clearing account
 * setting is put back afterwards.
 */

const SECRET =
  process.env.RAZORPAY_WEBHOOK_SECRET ?? "e2e-razorpay-webhook-secret";
const WEBHOOK = "/api/razorpay/webhook";
const CLEARING = "E2E Razorpay Clearing";
/** The seeded clearing account (helpers/seed-test-user.ts). */
const E2E_CLEARING_ID = "01930000-0000-7000-8000-000000000713";

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
    contact: string;
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

function refundEvent(refund: {
  amount: number;
  id: string;
  paymentId: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    account_id: "acc_E2E",
    contains: ["refund", "payment"],
    created_at: now,
    entity: "event",
    event: "refund.processed",
    payload: {
      payment: {
        entity: {
          amount: 50_000,
          captured: true,
          created_at: now,
          currency: "INR",
          entity: "payment",
          id: refund.paymentId,
          status: "refunded",
        },
      },
      refund: {
        entity: {
          acquirer_data: { arn: null },
          amount: refund.amount,
          created_at: now,
          currency: "INR",
          entity: "refund",
          id: refund.id,
          notes: [],
          payment_id: refund.paymentId,
          speed_processed: "normal",
          speed_requested: "normal",
          status: "processed",
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

/** An Indian mobile number unique to the run. */
const runPhone = (run: string) => `+9198${run.slice(-8)}`;

/** Waits until the payment's sync jobs have all finished. */
async function settled(paymentId: string) {
  await expect
    .poll(() => syncJobsSettled(paymentId), { timeout: 30_000 })
    .toBe(true);
}

async function contributionRows(page: Page, donor: string) {
  await page.goto("/income");
  await waitForZeroReady(page);
  await page.getByPlaceholder("Search donor or reference...").fill(donor);
  return page.getByRole("row").filter({ hasText: donor });
}

test.describe("Income: Razorpay Payment Page", () => {
  // One worker runs these in order: they share the global clearing account
  // setting, which is read once and put back once.
  test.describe.configure({ mode: "serial" });
  // Only the super_admin project runs these tests, so only it touches the
  // global setting; other projects' workers must not restore a stale value.
  let clearingBefore: string | null | undefined;

  test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
    if (testInfo.project.name === "super_admin") {
      clearingBefore = await fixture<string | null>("read-clearing");
    }
  });

  test.afterAll(async () => {
    if (clearingBefore !== undefined) {
      await fixture("restore-clearing", clearingBefore ?? "");
    }
  });

  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("refuses unsigned, wrongly signed and unreadable deliveries", async ({
    request,
  }) => {
    const body = capturedEvent("payment.captured", {
      amount: 10_000,
      contact: "+919800000000",
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
    // Over 1 MB: refused before the signature is even checked.
    const huge = JSON.stringify({ padding: "x".repeat(1024 * 1024) });
    expect((await post(request, huge)).status()).toBe(413);
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
    const firstId = `pay_E2E${run}`;
    const first = capturedEvent("payment.captured", {
      amount: 50_000,
      contact: runPhone(run),
      email,
      id: firstId,
      notes: { "Full Name": donor, "PAN Number": runPan(run) },
    });
    expect((await post(request, first)).status()).toBe(200);
    await expect
      .poll(() => paymentRows(firstId), { timeout: 30_000 })
      .toEqual([{ outcome: "imported", reason: null }]);
    await expect(await contributionRows(page, donor)).toHaveCount(1, {
      timeout: 30_000,
    });
    await expect(await contributionRows(page, donor)).toContainText("₹500.00");

    // Redelivered, and announced again as order.paid: once their jobs have
    // run, still one row and one contribution.
    expect((await post(request, first)).status()).toBe(200);
    const asOrder = first.replace('"payment.captured"', '"order.paid"');
    expect((await post(request, asOrder)).status()).toBe(200);
    await settled(firstId);
    expect(await paymentRows(firstId)).toEqual([
      { outcome: "imported", reason: null },
    ]);
    expect(await paymentContributions(firstId)).toBe(1);

    // Same email, no PAN: proposed as that donor, so it waits for review.
    const secondId = `pay_E2E${run}b`;
    const second = capturedEvent("payment.captured", {
      amount: 75_000,
      contact: runPhone(run),
      email,
      id: secondId,
      notes: { name: `E2E Razorpay Second ${run}` },
    });
    expect((await post(request, second)).status()).toBe(200);
    await expect
      .poll(() => paymentRows(secondId), { timeout: 30_000 })
      .toEqual([{ outcome: "pending", reason: "needs_review" }]);
    expect(await paymentContributions(secondId)).toBe(0);
    await expect(await contributionRows(page, donor)).toHaveCount(1);

    await page.goto("/income?tab=imports");
    await waitForZeroReady(page);
    // The batch of today's India day, which holds this run's payments.
    const today = new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "Asia/Kolkata",
      year: "numeric",
    });
    const batch = page
      .getByRole("row")
      .filter({ hasText: `Razorpay payments, ${today} (test mode)` })
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
    expect(await paymentRows(secondId)).toEqual([
      { outcome: "imported", reason: null },
    ]);
    expect(await paymentContributions(secondId)).toBe(1);

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

  test("applies signed refunds: partly refunded, then refunded, once each", async ({
    page,
    request,
  }) => {
    test.slow();
    const run = String(Date.now());
    const donor = `E2E Razorpay Refund ${run}`;
    const paymentId = `pay_E2ERefund${run}`;
    await fixture("restore-clearing", E2E_CLEARING_ID);

    // A gift of ₹500 imported at once (new donor with a PAN).
    const paid = capturedEvent("payment.captured", {
      amount: 50_000,
      contact: runPhone(run),
      email: `rzp-refund-${run}@example.test`,
      id: paymentId,
      notes: { "Full Name": donor, "PAN Number": runPan(run) },
    });
    expect((await post(request, paid)).status()).toBe(200);
    await expect
      .poll(() => paymentRows(paymentId), { timeout: 30_000 })
      .toEqual([{ outcome: "imported", reason: null }]);

    // ₹200 refunded: recorded from the webhook copy (no key secret in E2E),
    // and the gift stays received, shown as partly refunded.
    const firstRefund = refundEvent({
      amount: 20_000,
      id: `rfnd_E2EA${run}`,
      paymentId,
    });
    expect((await post(request, firstRefund)).status()).toBe(200);
    await expect
      .poll(() => paymentRefunds(paymentId), { timeout: 30_000 })
      .toEqual({
        refunds: [{ amountPaise: 20_000, reference: `rfnd_E2EA${run}` }],
        status: "received",
      });
    const row = (await contributionRows(page, donor)).first();
    // One badge, the amount in its tooltip.
    const status = row.getByTestId("contribution-status");
    await expect(status).toHaveText("Partly refunded", { timeout: 15_000 });
    await status.hover();
    await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText(
      "₹200.00 of ₹500.00 refunded"
    );
    await row.getByText(donor).click();
    await expect(
      page.getByRole("dialog").getByText("₹200.00 of ₹500.00 refunded")
    ).toBeVisible();
    await expect(page.getByTestId("contribution-refunds")).toContainText(
      `rfnd_E2EA${run}`
    );
    await expect(page.getByTestId("contribution-refunds")).toContainText(
      "₹200.00"
    );
    await page.keyboard.press("Escape");

    // Delivered again: still one refund.
    expect((await post(request, firstRefund)).status()).toBe(200);
    await expect
      .poll(() => refundJobsSettled(`rfnd_E2EA${run}`), { timeout: 30_000 })
      .toBe(true);
    expect((await paymentRefunds(paymentId)).refunds).toHaveLength(1);

    // The other ₹300 refunded: the gift is refunded now.
    const secondRefund = refundEvent({
      amount: 30_000,
      id: `rfnd_E2EB${run}`,
      paymentId,
    });
    expect((await post(request, secondRefund)).status()).toBe(200);
    await expect
      .poll(async () => (await paymentRefunds(paymentId)).status, {
        timeout: 30_000,
      })
      .toBe("refunded");
    const refundedRow = (await contributionRows(page, donor)).first();
    await expect(refundedRow.getByTestId("contribution-status")).toHaveText(
      "Refunded",
      { timeout: 15_000 }
    );
  });

  test("holds a refund that arrives before its payment and applies it at import", async ({
    page,
    request,
  }) => {
    test.slow();
    const run = String(Date.now());
    const donor = `E2E Razorpay Early Refund ${run}`;
    const paymentId = `pay_E2EEarly${run}`;
    const refundId = `rfnd_E2EEarly${run}`;
    await fixture("restore-clearing", E2E_CLEARING_ID);

    // The refund first: nothing to apply it to, so it is held.
    expect(
      (
        await post(
          request,
          refundEvent({ amount: 50_000, id: refundId, paymentId })
        )
      ).status()
    ).toBe(200);
    await expect
      .poll(() => refundJobsSettled(refundId), { timeout: 30_000 })
      .toBe(true);
    expect(await pendingRefunds(paymentId)).toBe(1);
    await page.goto("/settings/integrations");
    await waitForZeroReady(page);
    await expect(page.getByTestId("razorpay-pending-refunds")).toContainText(
      "waiting for"
    );

    // Then the payment: imported, and the held refund applied in the same
    // transaction, so the gift is refunded at once.
    const paid = capturedEvent("payment.captured", {
      amount: 50_000,
      contact: runPhone(run),
      email: `rzp-early-${run}@example.test`,
      id: paymentId,
      notes: { "Full Name": donor, "PAN Number": runPan(run) },
    });
    expect((await post(request, paid)).status()).toBe(200);
    await expect
      .poll(() => paymentRefunds(paymentId), { timeout: 30_000 })
      .toEqual({
        refunds: [{ amountPaise: 50_000, reference: refundId }],
        status: "refunded",
      });
    expect(await pendingRefunds(paymentId)).toBe(0);
  });

  test("without the key secret, Sync now retries stuck payments and Import past payments is off", async ({
    page,
  }) => {
    test.slow();
    await page.goto("/settings/integrations");
    await waitForZeroReady(page);
    await expect(page.getByTestId("razorpay-sync-unavailable")).toContainText(
      "RAZORPAY_KEY_SECRET"
    );
    await expect(
      page.getByRole("button", { name: "Import past payments" })
    ).toBeDisabled();
    await expect(page.getByText("refund.processed")).toBeVisible();

    const syncNow = page.getByRole("button", { name: "Sync now" });
    await expect(syncNow).toBeEnabled();
    await syncNow.click();
    await expect(page.getByText("Syncing with Razorpay")).toBeVisible();
    // The run finishes without listing anything from Razorpay.
    await expect(page.getByTestId("razorpay-last-sync")).toContainText(
      "stuck payments retried",
      { timeout: 60_000 }
    );
    await expect(syncNow).toBeEnabled({ timeout: 15_000 });
  });
});
