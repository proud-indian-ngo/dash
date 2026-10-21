import { describe, expect, it, mock } from "bun:test";

class ReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptError";
  }
}

mock.module("@pi-dash/db", () => ({
  db: { transaction: async () => undefined },
}));
mock.module("@pi-dash/db/queries/contribution-receipts", () => ({
  hasReceiptHistoryIn: async () => false,
  issueReceiptsIn: async () => ({ issued: [], skipped: [] }),
  loadReceiptConfig: async () => ({ registration: null, settings: null }),
  receiptConfigGaps: () => [],
  ReceiptError,
}));
mock.module("../enqueue", () => ({
  enqueue: async () => null,
  inTransaction: () => ({}),
}));
mock.module("./create-handler", () => ({
  createNotifyHandler: () => async () => ({}),
}));

const { issueContributionReceipt } =
  await import("./issue-contribution-receipt");
type Dependencies = NonNullable<Parameters<typeof issueContributionReceipt>[1]>;

const payload = { actorId: "user-1", contributionId: "contribution-1" };
const tx = { transaction: true } as never;
const transactionAdapter = { adapter: true } as never;
const readyConfig = {
  registration: {} as never,
  settings: {} as never,
};

function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    configGaps: () => [],
    enqueueDelivery: async () => "job-1",
    hasHistory: async () => false,
    issue: async () => ({
      issued: [
        {
          contributionId: payload.contributionId,
          id: "receipt-1",
          number: "PI/2026-27/0001",
        },
      ],
      skipped: [],
    }),
    loadConfig: async () => readyConfig,
    runTransaction: async (work) => work(tx),
    transactionDb: () => transactionAdapter,
    ...overrides,
  };
}

describe("issueContributionReceipt", () => {
  it("leaves the contribution unchanged when receipt configuration is missing", async () => {
    let checkedHistory = false;
    let issued = false;

    expect(
      await issueContributionReceipt(
        payload,
        dependencies({
          configGaps: () => ["missing"],
          hasHistory: async () => {
            checkedHistory = true;
            return false;
          },
          issue: async () => {
            issued = true;
            return { issued: [], skipped: [] };
          },
          loadConfig: async () => ({ registration: null, settings: null }),
        })
      )
    ).toEqual({
      outcome: "config_missing",
      reason: "receipt_configuration_incomplete",
    });
    expect(checkedHistory).toBe(true);
    expect(issued).toBe(false);
  });

  it("returns a bounded donor-detail reason for an eligibility block", async () => {
    let enqueued = false;

    expect(
      await issueContributionReceipt(
        payload,
        dependencies({
          enqueueDelivery: async () => {
            enqueued = true;
            return null;
          },
          issue: async () => ({
            issued: [],
            skipped: [
              {
                contributionId: payload.contributionId,
                reason: "missing_address,missing_id",
              },
            ],
          }),
        })
      )
    ).toEqual({
      outcome: "not_ready",
      reason: "donor_details_incomplete",
    });
    expect(enqueued).toBe(false);
  });

  it("does not replace a live or deliberately voided receipt", async () => {
    let issued = false;

    expect(
      await issueContributionReceipt(
        payload,
        dependencies({
          hasHistory: async () => true,
          issue: async () => {
            issued = true;
            return { issued: [], skipped: [] };
          },
        })
      )
    ).toEqual({ outcome: "existing_receipt" });
    expect(issued).toBe(false);
  });

  it("queues email and WhatsApp delivery through the issuing transaction", async () => {
    const deliveries: Array<{
      name: string;
      options: { db: unknown; singletonKey: string };
      payload: unknown;
    }> = [];

    expect(
      await issueContributionReceipt(
        payload,
        dependencies({
          enqueueDelivery: async (name, deliveryPayload, options) => {
            deliveries.push({ name, options, payload: deliveryPayload });
            return `job-${deliveries.length}`;
          },
        })
      )
    ).toEqual({ outcome: "issued", receiptId: "receipt-1" });
    expect(deliveries).toEqual([
      {
        name: "send-contribution-receipt",
        options: {
          db: transactionAdapter,
          singletonKey: "automatic:receipt-1",
        },
        payload: { receiptId: "receipt-1", requestId: "automatic" },
      },
      {
        name: "send-contribution-receipt-whatsapp",
        options: {
          db: transactionAdapter,
          singletonKey: "automatic:receipt-1",
        },
        payload: { receiptId: "receipt-1", requestId: "automatic" },
      },
    ]);
  });

  it("propagates a sanitized enqueue error so the issue transaction rolls back", async () => {
    let enqueueCalls = 0;
    let rolledBack = false;
    const raw = new Error("donor@example.com enqueue failed", {
      cause: { code: "23505" },
    });

    const promise = issueContributionReceipt(
      payload,
      dependencies({
        enqueueDelivery: async () => {
          enqueueCalls += 1;
          if (enqueueCalls === 2) {
            throw raw;
          }
          return "job-1";
        },
        runTransaction: async (work) => {
          try {
            return await work(tx);
          } catch (error) {
            rolledBack = true;
            throw error;
          }
        },
      })
    );

    await expect(promise).rejects.toThrow(
      "issue_contribution_receipt_failed: Error (23505)"
    );
    await expect(promise).rejects.not.toThrow("donor@example.com");
    expect(rolledBack).toBe(true);
  });

  it("does not issue or deliver again when the job repeats", async () => {
    let hasHistory = false;
    let issueCount = 0;
    let deliveryCount = 0;
    const deps = dependencies({
      enqueueDelivery: async () => {
        deliveryCount += 1;
        return `job-${deliveryCount}`;
      },
      hasHistory: async () => hasHistory,
      issue: async () => {
        issueCount += 1;
        hasHistory = true;
        return {
          issued: [
            {
              contributionId: payload.contributionId,
              id: "receipt-1",
              number: "PI/2026-27/0001",
            },
          ],
          skipped: [],
        };
      },
    });

    expect(await issueContributionReceipt(payload, deps)).toEqual({
      outcome: "issued",
      receiptId: "receipt-1",
    });
    expect(await issueContributionReceipt(payload, deps)).toEqual({
      outcome: "existing_receipt",
    });
    expect(issueCount).toBe(1);
    expect(deliveryCount).toBe(2);
  });

  it("turns donor ID decryption failures into a non-retrying outcome", async () => {
    expect(
      await issueContributionReceipt(
        payload,
        dependencies({
          issue: async () => {
            throw new ReceiptError("private donor details failed");
          },
        })
      )
    ).toEqual({
      outcome: "not_ready",
      reason: "donor_details_unavailable",
    });
  });
});
