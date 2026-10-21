import { describe, expect, it, mock } from "bun:test";

class ReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptError";
  }
}

class ReceiptSignatureError extends Error {}

mock.module("../lib/receipt-pdf", () => ({
  readReceiptSignature: async () => Buffer.from("signature"),
  ReceiptSignatureError,
}));

mock.module("@pi-dash/db", () => ({
  db: { transaction: async () => undefined },
}));
mock.module("@pi-dash/db/queries/contribution-receipts", () => ({
  hasReceiptHistoryIn: async () => false,
  issueReceiptsIn: async () => ({ issued: [], skipped: [] }),
  loadReceiptConfig: async () => ({
    registration: null,
    settings: null,
    signatureMissing: false,
  }),
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
  settings: {
    orgAddress: "Test address",
    orgName: "Test Trust",
    orgPan: "AAATE0000E",
    signatoryDesignation: "Trustee",
    signatoryName: "Test Signatory",
    signatureKey: "attachments/receipt-signatures/signature.png",
  },
  signatureMissing: false,
};

function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    configGaps: () => [],
    enqueueJob: async () => "job-1",
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
    readSignature: async () => Buffer.from("signature"),
    runTransaction: async (work) => work(tx),
    transactionDb: () => transactionAdapter,
    ...overrides,
  };
}

describe("issueContributionReceipt", () => {
  it("verifies the configured signature before issuing or allocating a number", async () => {
    const steps: string[] = [];
    const issue = dependencies().issue;
    await issueContributionReceipt(
      payload,
      dependencies({
        readSignature: async (key) => {
          expect(key).toBe(readyConfig.settings.signatureKey);
          steps.push("signature");
          return Buffer.from("signature");
        },
        issue: async (...args) => {
          steps.push("issue");
          return issue(...args);
        },
      })
    );
    expect(steps).toEqual(["signature", "issue"]);
  });

  it.each([null, { ...readyConfig.settings, signatureKey: "" }])(
    "refuses missing settings or a missing signature key",
    async (settings) => {
      const issue = mock(dependencies().issue);
      const enqueueJob = mock(dependencies().enqueueJob);
      const readSignature = mock(dependencies().readSignature);
      expect(
        await issueContributionReceipt(
          payload,
          dependencies({
            enqueueJob,
            issue,
            loadConfig: async () => ({ ...readyConfig, settings }),
            readSignature,
          })
        )
      ).toEqual({
        outcome: "config_missing",
        reason: "receipt_configuration_incomplete",
      });
      expect(readSignature).not.toHaveBeenCalled();
      expect(issue).not.toHaveBeenCalled();
      expect(enqueueJob).not.toHaveBeenCalled();
    }
  );

  it("refuses an unreadable signature without issuing or queuing jobs", async () => {
    const issue = mock(dependencies().issue);
    const enqueueJob = mock(dependencies().enqueueJob);
    expect(
      await issueContributionReceipt(
        payload,
        dependencies({
          enqueueJob,
          issue,
          readSignature: async () => {
            throw new ReceiptSignatureError("private signature key");
          },
        })
      )
    ).toEqual({
      outcome: "config_missing",
      reason: "receipt_configuration_incomplete",
    });
    expect(issue).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("sanitizes transient signature storage errors and lets the job retry", async () => {
    const issue = mock(dependencies().issue);
    const enqueueJob = mock(dependencies().enqueueJob);
    const promise = issueContributionReceipt(
      payload,
      dependencies({
        enqueueJob,
        issue,
        readSignature: async () => {
          throw new Error("private signature key donor@example.com");
        },
      })
    );
    await expect(promise).rejects.toThrow(
      "issue_contribution_receipt_failed: Error"
    );
    await expect(promise).rejects.not.toThrow("private signature key");
    await expect(promise).rejects.not.toThrow("donor@example.com");
    expect(issue).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
  });

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
          loadConfig: async () => ({
            registration: null,
            settings: null,
            signatureMissing: false,
          }),
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
          enqueueJob: async () => {
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

  it("queues PDF storage, email and WhatsApp through the issuing transaction", async () => {
    const deliveries: Array<{
      name: string;
      options: unknown;
      payload: unknown;
    }> = [];

    expect(
      await issueContributionReceipt(
        payload,
        dependencies({
          enqueueJob: async (name, deliveryPayload, options) => {
            deliveries.push({ name, options, payload: deliveryPayload });
            return `job-${deliveries.length}`;
          },
        })
      )
    ).toEqual({ outcome: "issued", receiptId: "receipt-1" });
    expect(deliveries).toEqual([
      {
        name: "store-contribution-receipt-pdf",
        options: {
          db: transactionAdapter,
          singletonKey: "automatic:receipt-1",
        },
        payload: { receiptId: "receipt-1" },
      },
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
    expect(deliveries[1]?.options).toBe(deliveries[0]?.options);
    expect(deliveries[2]?.options).toBe(deliveries[0]?.options);
  });

  it.each([
    "store-contribution-receipt-pdf",
    "send-contribution-receipt",
    "send-contribution-receipt-whatsapp",
  ])("rolls back issuance when %s enqueue fails", async (failedQueue) => {
    let rolledBack = false;
    const raw = new Error("donor@example.com enqueue failed", {
      cause: { code: "23505" },
    });

    const promise = issueContributionReceipt(
      payload,
      dependencies({
        enqueueJob: async (name) => {
          if (name === failedQueue) {
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
      enqueueJob: async () => {
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
    expect(deliveryCount).toBe(3);
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
