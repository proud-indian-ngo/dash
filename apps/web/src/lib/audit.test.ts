import { beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("evlog", () => ({
  createRequestLogger: () => ({
    emit: mock(),
    error: mock(),
    set: mock(),
  }),
}));

mock.module("@pi-dash/db", () => ({ db: {} }));

import {
  AuditFinalizationError,
  type AuditStore,
  buildAuditEntry,
  buildZeroAuditEntry,
  classifyAuditError,
  classifyAuditResponse,
  createAuditedActionRunner,
  resolveSessionAuditTarget,
  resolveZeroAuditSummary,
  runZeroAuditedMutation,
  sanitizeAuditTarget,
  snapshotAuditActor,
  summarizeZeroMutation,
} from "./audit";

const TARGET_ID = "019b1111-1111-7111-8111-111111111111";
const TEAM_ID = "019b2222-2222-7222-8222-222222222222";
const NEW_ID = "019b3333-3333-7333-8333-333333333333";
const REPLACED_ID = "019b4444-4444-7444-8444-444444444444";
const BETTER_AUTH_USER_ID = "0123456789abcdefghijklmnopqrstuv";
const options = {
  action: "user.update",
  actor: { name: "Admin", role: "super_admin", userId: "actor-1" },
  target: { id: TARGET_ID, type: "user" },
};

function makeStore(): AuditStore & {
  finalize: ReturnType<typeof mock>;
  insert: ReturnType<typeof mock>;
} {
  return {
    finalize: mock(async () => undefined),
    insert: mock(async () => undefined),
  };
}

describe("audit metadata", () => {
  it.each([true, false])(
    "records award handover intent with bounded identifiers (%s)",
    (awarded) => {
      const summary = summarizeZeroMutation(
        "kalakritiAward.set",
        {
          editionId: TEAM_ID,
          entryId: TARGET_ID,
          awarded,
          expectedVersions: [
            ...Array.from({ length: 60 }, () => ({
              studentId: TARGET_ID,
              version: 7,
            })),
            { studentId: "private@example.com", name: "Private student" },
          ],
          name: "Private student",
        },
        "actor-1"
      );
      expect(summary.action).toBe(
        awarded ? "kalakritiAward.award" : "kalakritiAward.undo"
      );
      expect(summary.target).toEqual({ type: "kalakritiAward", id: TARGET_ID });
      expect(summary.metadata.changedFields).toEqual(["awarded"]);
      expect(summary.metadata.batchCount).toBe(60);
      expect(
        (summary.metadata.relatedIds as Record<string, string[]>).studentIds
      ).toHaveLength(50);
      expect(JSON.stringify(summary)).not.toContain("Private student");
      expect(JSON.stringify(summary)).not.toContain("private@example.com");
      expect(JSON.stringify(summary)).not.toContain("version");
    }
  );

  it("snapshots actor and impersonator attribution", () => {
    expect(
      snapshotAuditActor(
        {
          session: { impersonatedBy: "impersonator-1" },
          user: { id: "actor-1", name: " Admin ", role: "super_admin" },
        },
        "Impersonator"
      )
    ).toEqual({
      impersonatorName: "Impersonator",
      impersonatorUserId: "impersonator-1",
      name: "Admin",
      role: "super_admin",
      userId: "actor-1",
    });
  });

  it("records the paise amount field on payment writes", () => {
    const payment = summarizeZeroMutation(
      "vendorPaymentTransaction.update",
      { amountPaise: 50_000, id: TARGET_ID },
      "actor-1"
    );
    expect(payment.metadata?.changedFields).toEqual(["amountPaise", "id"]);
  });

  it("records the provision head and line IDs, with their count, when an invoice is charged to a provision, never the note", () => {
    const headId = "01930000-0000-7000-8000-000000000802";
    const lineIds = [
      "0190a000-0000-7000-8000-0000000000b1",
      "0190a000-0000-7000-8000-0000000000b2",
    ];
    const summary = summarizeZeroMutation(
      "vendorPayment.approveInvoice",
      {
        id: TARGET_ID,
        note: "Audit fee for the year",
        provisionHeadId: headId,
        provisionLineIds: lineIds,
      },
      "actor-1"
    );
    expect(summary.metadata.changedFields).toEqual([
      "id",
      "note",
      "provisionHeadId",
      "provisionLineIds",
    ]);
    expect(summary.metadata.relatedIds).toEqual({
      id: TARGET_ID,
      provisionHeadId: headId,
      provisionLineIds: lineIds,
    });
    expect(summary.metadata.batchCount).toBe(2);
    expect(JSON.stringify(summary)).not.toContain("Audit fee for the year");
  });

  it("records contribution field names and ids but never their text", () => {
    const partyId = "0190a000-0000-7000-8000-0000000000a1";
    const fundId = "0190a000-0000-7000-8000-0000000000a2";
    const orgAccountId = "0190a000-0000-7000-8000-0000000000a3";
    const summary = summarizeZeroMutation(
      "contribution.create",
      {
        amountPaise: 500_000,
        channel: "upi",
        donationType: "other",
        donationTypeDescription: "Sponsorship of the annual day",
        fundId,
        id: TARGET_ID,
        notes: "Called the donor on 3 Oct",
        orgAccountId,
        partyId,
        receivedOn: "2026-10-01",
        reference: "UTR998877",
        reportingMode: "electronic_or_account_payee",
      },
      "actor-1"
    );
    expect(summary.metadata.changedFields).toEqual([
      "amountPaise",
      "channel",
      "donationType",
      "donationTypeDescription",
      "fundId",
      "id",
      "orgAccountId",
      "partyId",
      "receivedOn",
      "reference",
      "reportingMode",
    ]);
    expect(summary.metadata.relatedIds).toEqual({
      fundId,
      id: TARGET_ID,
      orgAccountId,
      partyId,
    });
    expect(summary.target).toEqual({ id: TARGET_ID, type: "contribution" });
    const serialized = JSON.stringify(summary);
    for (const secret of ["UTR998877", "Called the donor", "Sponsorship"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("records finance-control fields on programme and config writes", () => {
    const programme = summarizeZeroMutation(
      "programme.update",
      {
        active: false,
        code: "EDU",
        financeThresholdPaise: 2_500_000,
        id: TARGET_ID,
        leadUserId: "actor-1",
        name: "Education",
      },
      "actor-1"
    );
    expect(programme.metadata?.changedFields).toEqual([
      "active",
      "code",
      "financeThresholdPaise",
      "id",
      "leadUserId",
      "name",
    ]);

    const config = summarizeZeroMutation(
      "appConfig.upsert",
      { key: "finance_threshold_default_paise", value: "1200000" },
      "actor-1"
    );
    expect(config.metadata?.changedFields).toEqual(["key", "value"]);
    expect(JSON.stringify(config)).not.toContain("1200000");
  });

  it("records receipt details by field name, and a new signature without its key", () => {
    const args = {
      orgAddress: "1 Test Road",
      orgName: "Example Trust",
      orgPan: "AAATE0000E",
      signatoryDesignation: "Treasurer",
      signatoryName: "Test Signatory",
    };
    const replaced = summarizeZeroMutation(
      "appConfig.saveReceiptSettings",
      { ...args, signatureUpload: "app/attachments/tmp/u/signature.png" },
      "actor-1"
    );
    expect(replaced.target).toEqual({
      id: "donation_receipt_settings",
      type: "appConfig",
    });
    expect(replaced.metadata?.changedFields).toContain("signature");
    expect(JSON.stringify(replaced)).not.toContain("signature.png");
    expect(JSON.stringify(replaced)).not.toContain("AAATE0000E");
    const kept = summarizeZeroMutation(
      "appConfig.saveReceiptSettings",
      { ...args, signatureUpload: null },
      "actor-1"
    );
    expect(kept.metadata?.changedFields).not.toContain("signature");
  });

  it("records a signed voucher upload by IDs, never its object key", () => {
    const summary = summarizeZeroMutation(
      "reimbursement.attachSignedVoucher",
      {
        lineItemId: TARGET_ID,
        reimbursementId: TEAM_ID,
        replacesAttachmentId: REPLACED_ID,
        signedCopy: {
          filename: "signed.jpg",
          id: NEW_ID,
          objectKey: "app/attachments/tmp/u/signed.jpg",
        },
      },
      "actor-1"
    );
    expect(summary.metadata?.changedFields).toEqual([
      "reimbursementId",
      "signedCopy",
    ]);
    expect(summary.metadata?.relatedIds).toMatchObject({
      lineItemId: TARGET_ID,
    });
    expect(JSON.stringify(summary)).not.toContain("signed.jpg");
  });

  it("records payment proof by IDs and field names, never its object key", () => {
    const summary = summarizeZeroMutation(
      "reimbursement.addPaymentProof",
      {
        approvalScreenshotKey: "app/approval-screenshots/tmp/u/upi-proof.png",
        id: TARGET_ID,
        keptAttachmentId: NEW_ID,
        replacing: true,
      },
      "actor-1"
    );
    expect(summary.target).toEqual({ id: TARGET_ID, type: "reimbursement" });
    expect(summary.metadata?.changedFields).toEqual([
      "approvalScreenshotKey",
      "id",
      "replacing",
    ]);
    expect(summary.metadata?.relatedIds).toMatchObject({
      keptAttachmentId: NEW_ID,
    });
    expect(JSON.stringify(summary)).not.toContain("upi-proof");
    expect(JSON.stringify(summary)).not.toContain("approval-screenshots/");
  });

  it("records a payee signature by IDs, never the payee or the key", () => {
    const summary = summarizeZeroMutation(
      "reimbursement.collectPayeeSignature",
      {
        attachmentId: NEW_ID,
        lineItemId: TARGET_ID,
        objectKey: "app/attachments/tmp/u/payee-signature.png",
        reimbursementId: TEAM_ID,
        replacesAttachmentId: REPLACED_ID,
        signedFacts: {
          amountPaise: 50_000,
          categoryId: TARGET_ID,
          description: "Cleaning",
          expenseDay: "2026-10-01",
          payeeName: "Test Payee",
        },
      },
      "actor-1"
    );
    expect(summary.metadata?.relatedIds).toEqual({
      attachmentId: NEW_ID,
      lineItemId: TARGET_ID,
      reimbursementId: TEAM_ID,
      replacesAttachmentId: REPLACED_ID,
    });
    const stored = JSON.stringify(summary);
    expect(stored).not.toContain("Test Payee");
    expect(stored).not.toContain("payee-signature.png");
  });

  it("keeps IDs and field names without storing sensitive values", () => {
    const summary = summarizeZeroMutation(
      "user.update",
      {
        email: "private@example.com",
        id: TARGET_ID,
        password: "secret",
        phone: "+911234567890",
        teamId: TEAM_ID,
      },
      "actor-1"
    );

    expect(summary.target).toEqual({ id: TARGET_ID, type: "user" });
    expect(summary.metadata).toEqual({
      changedFields: ["email", "id", "password", "phone", "teamId"],
      relatedIds: { id: TARGET_ID, teamId: TEAM_ID },
    });
    expect(JSON.stringify(summary)).not.toContain("private@example.com");
    expect(JSON.stringify(summary)).not.toContain("secret");
    expect(JSON.stringify(summary)).not.toContain("+911234567890");
  });

  it("rejects attacker-shaped IDs and bounds field names", () => {
    const oversizedKey = "x".repeat(81);
    const summary = summarizeZeroMutation(
      "notification.markAllAsRead",
      { [oversizedKey]: "value", passwordId: "secret" },
      "actor-1"
    );

    expect(summary.metadata).toEqual({ changedFields: [] });
    expect(JSON.stringify(summary)).not.toContain("secret");
    expect(JSON.stringify(summary)).not.toContain(oversizedKey);
  });

  it("records inventory field names without photo keys, notes, or stock values", () => {
    const summary = summarizeZeroMutation(
      "kalakritiInventory.create",
      {
        itemId: TARGET_ID,
        name: "Private item name",
        openingQuantity: 123,
        unitPricePaise: 456,
        notes: "Private stock note",
        photo: { objectKey: "private/object/key", fileName: "private.png" },
      },
      "actor-1"
    );
    expect(summary.metadata).toEqual({
      changedFields: ["name", "openingQuantity", "photo", "unitPricePaise"],
      relatedIds: { itemId: TARGET_ID },
    });
    expect(JSON.stringify(summary)).not.toContain("Private");
    expect(JSON.stringify(summary)).not.toContain("private/");
  });

  it("resolves only canonical existing Better Auth IDs for Zero summaries", async () => {
    const unknownUserId = "abcdef0123456789abcdef0123456789";
    const resolveExisting = mock(async () => new Set([BETTER_AUTH_USER_ID]));

    const summary = await resolveZeroAuditSummary(
      "team.addMembers",
      { userIds: [BETTER_AUTH_USER_ID, unknownUserId] },
      "differentActorId000000000000000",
      resolveExisting
    );

    expect(resolveExisting).toHaveBeenCalledWith([
      BETTER_AUTH_USER_ID,
      unknownUserId,
    ]);
    expect(summary.metadata).toEqual({
      batchCount: 1,
      changedFields: ["userIds"],
      relatedIds: { userIds: [BETTER_AUTH_USER_ID] },
    });
  });

  it("records a claimant change by IDs and field names, never the reason", async () => {
    const previousUserId = "abcdefghijklmnopqrstuv0123456789";
    const summary = await resolveZeroAuditSummary(
      "reimbursement.changeClaimant",
      {
        bankAccountId: NEW_ID,
        id: TARGET_ID,
        previousUserId,
        reason: "Paid by someone else",
        userId: BETTER_AUTH_USER_ID,
      },
      "differentActorId000000000000000",
      async () => new Set([BETTER_AUTH_USER_ID, previousUserId])
    );
    expect(summary.target).toEqual({
      id: TARGET_ID,
      type: "reimbursement",
    });
    expect(summary.metadata?.changedFields).toEqual([
      "bankAccountId",
      "id",
      "previousUserId",
      "reason",
      "userId",
    ]);
    expect(summary.metadata?.relatedIds).toEqual({
      bankAccountId: NEW_ID,
      id: TARGET_ID,
      previousUserId,
      userId: BETTER_AUTH_USER_ID,
    });
    expect(JSON.stringify(summary)).not.toContain("Paid by");
  });

  it("records a void by the entity ID and field names, never the reason", async () => {
    for (const [action, type] of [
      ["reimbursement.void", "reimbursement"],
      ["vendorPayment.void", "vendorPayment"],
      ["vendorPaymentTransaction.void", "vendorPaymentTransaction"],
    ] as const) {
      const summary = await resolveZeroAuditSummary(
        action,
        { id: TARGET_ID, reason: "Paid twice to Ravi on 9876543210" },
        "differentActorId000000000000000",
        async () => new Set()
      );
      expect(summary.target).toEqual({ id: TARGET_ID, type });
      expect(summary.metadata?.changedFields).toEqual(["id", "reason"]);
      expect(JSON.stringify(summary)).not.toContain("Paid twice");
      expect(JSON.stringify(summary)).not.toContain("9876543210");
    }
  });

  it("records the claimant of a claim raised for someone else", async () => {
    const summary = await resolveZeroAuditSummary(
      "reimbursement.create",
      {
        claimantBankAccountId: NEW_ID,
        claimantUserId: BETTER_AUTH_USER_ID,
        id: TARGET_ID,
        title: "Travel",
      },
      "differentActorId000000000000000",
      async () => new Set([BETTER_AUTH_USER_ID])
    );
    expect(summary.metadata?.relatedIds).toMatchObject({
      claimantBankAccountId: NEW_ID,
      claimantUserId: BETTER_AUTH_USER_ID,
    });
    expect(summary.metadata?.changedFields).toEqual(
      expect.arrayContaining(["claimantBankAccountId", "claimantUserId"])
    );
  });

  it("drops unknown session targets and propagates resolver failures", async () => {
    const unknown = mock(async () => new Set<string>());
    await expect(
      resolveSessionAuditTarget(
        { id: BETTER_AUTH_USER_ID, type: "user" },
        "differentActorId000000000000000",
        unknown
      )
    ).resolves.toEqual({ type: "user" });

    const failure = mock(() =>
      Promise.reject(new Error("database unavailable"))
    );
    await expect(
      resolveZeroAuditSummary(
        "team.addMember",
        { userId: BETTER_AUTH_USER_ID },
        "differentActorId000000000000000",
        failure
      )
    ).rejects.toThrow("database unavailable");
  });

  it("trusts the session actor target without a database lookup", async () => {
    const resolveExisting = mock(async () => new Set<string>());
    await expect(
      resolveSessionAuditTarget(
        { id: BETTER_AUTH_USER_ID, type: "user" },
        BETTER_AUTH_USER_ID,
        resolveExisting
      )
    ).resolves.toEqual({ id: BETTER_AUTH_USER_ID, type: "user" });
    expect(resolveExisting).not.toHaveBeenCalled();
  });

  it("retains only role IDs resolved from the role table", async () => {
    const resolveUsers = mock(async () => new Set<string>());
    const resolveRoles = mock(async () => new Set(["team_lead"]));

    await expect(
      resolveSessionAuditTarget(
        { id: "team_lead", type: "role" },
        BETTER_AUTH_USER_ID,
        resolveUsers,
        resolveRoles
      )
    ).resolves.toEqual({ id: "team_lead", type: "role" });
    await expect(
      resolveSessionAuditTarget(
        { id: "missing_role", type: "role" },
        BETTER_AUTH_USER_ID,
        resolveUsers,
        resolveRoles
      )
    ).resolves.toEqual({ type: "role" });
    await expect(
      resolveSessionAuditTarget(
        { id: "sk_live_secretvalue", type: "role" },
        BETTER_AUTH_USER_ID,
        resolveUsers,
        resolveRoles
      )
    ).resolves.toEqual({ type: "role" });
    expect(resolveUsers).not.toHaveBeenCalled();
    expect(resolveRoles).toHaveBeenCalledWith(["missing_role"]);
  });

  it("caps batch identifiers and records the retained count", () => {
    const ids = Array.from(
      { length: 60 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`
    );
    const summary = summarizeZeroMutation(
      "eventPhoto.approveBatch",
      { photoIds: ids },
      "actor-1"
    );

    expect(summary.metadata.batchCount).toBe(50);
    expect(
      (summary.metadata.relatedIds as Record<string, string[]>).photoIds
    ).toHaveLength(50);
  });

  it("keeps camel-case Zero targets and Better Auth user IDs", () => {
    const entitySummary = summarizeZeroMutation(
      "eventPhoto.approve",
      { id: TARGET_ID },
      BETTER_AUTH_USER_ID
    );
    expect(
      buildZeroAuditEntry({
        action: "eventPhoto.approve",
        actor: options.actor,
        ...entitySummary,
      })
    ).toMatchObject({ targetId: TARGET_ID, targetType: "eventPhoto" });

    const userSummary = summarizeZeroMutation(
      "team.addMember",
      { userId: BETTER_AUTH_USER_ID },
      "differentActorId000000000000000",
      new Set([BETTER_AUTH_USER_ID])
    );
    expect(userSummary).toEqual({
      metadata: {
        changedFields: ["userId"],
        relatedIds: { userId: BETTER_AUTH_USER_ID },
      },
      target: { id: BETTER_AUTH_USER_ID, type: "user" },
    });

    expect(
      summarizeZeroMutation(
        "team.addMember",
        { userId: "0123456789abcdef0123456789abcdef" },
        "differentActorId000000000000000"
      ).metadata
    ).toEqual({ changedFields: ["userId"] });
  });

  it("sets pending and final completion timestamps consistently", () => {
    expect(buildAuditEntry(options, "pending").completedAt).toBeNull();
    expect(buildAuditEntry(options, "success").completedAt).toBeInstanceOf(
      Date
    );
  });

  it("drops free-text and oversized target identifiers", () => {
    expect(
      sanitizeAuditTarget({ id: "private free text", type: "event" })
    ).toEqual({ type: "event" });
    expect(
      sanitizeAuditTarget({ id: "x".repeat(129), type: "Invalid Type" })
    ).toEqual({});
  });

  it("drops contact and token-shaped targets but keeps canonical IDs", () => {
    expect(
      sanitizeAuditTarget({ id: "victim@example.com", type: "event" })
    ).toEqual({ type: "event" });
    expect(
      sanitizeAuditTarget({ id: "compact-api-token", type: "user" })
    ).toEqual({ type: "user" });
    expect(sanitizeAuditTarget({ id: "team_lead", type: "role" })).toEqual({
      id: "team_lead",
      type: "role",
    });
    expect(sanitizeAuditTarget({ id: TARGET_ID, type: "event" })).toEqual({
      id: TARGET_ID,
      type: "event",
    });
    expect(
      sanitizeAuditTarget({
        id: BETTER_AUTH_USER_ID,
        type: "user",
      })
    ).toEqual({
      id: BETTER_AUTH_USER_ID,
      type: "user",
    });
  });
});

describe("audited action runner", () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
  });

  it("writes pending before execution and finalizes success", async () => {
    const execute = mock(async () => "done");
    const result = await createAuditedActionRunner(store)(options, execute);

    expect(result).toBe("done");
    expect(store.insert).toHaveBeenCalledTimes(1);
    expect(store.insert.mock.calls[0]?.[0].outcome).toBe("pending");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(store.finalize).toHaveBeenCalledWith(expect.any(String), "success");
  });

  it("does not execute when the pending insert fails", async () => {
    store.insert.mockRejectedValueOnce(new Error("database unavailable"));
    const execute = mock(async () => undefined);

    await expect(
      createAuditedActionRunner(store)(options, execute)
    ).rejects.toThrow("database unavailable");
    expect(execute).not.toHaveBeenCalled();
  });

  it("finalizes denied attempts before rethrowing", async () => {
    await expect(
      createAuditedActionRunner(store)(options, () =>
        Promise.reject(new Error("Forbidden"))
      )
    ).rejects.toThrow("Forbidden");
    expect(store.finalize).toHaveBeenCalledWith(expect.any(String), "denied");
  });

  it("finalizes operational errors as failures before rethrowing", async () => {
    await expect(
      createAuditedActionRunner(store)(options, () =>
        Promise.reject(new Error("Service unavailable"))
      )
    ).rejects.toThrow("Service unavailable");
    expect(store.finalize).toHaveBeenCalledWith(expect.any(String), "failure");
  });

  it("uses a returned-result classifier", async () => {
    await createAuditedActionRunner(store)(
      options,
      async () => ({ type: "error" as const }),
      () => "failure"
    );
    expect(store.finalize).toHaveBeenCalledWith(expect.any(String), "failure");
  });

  it("attaches a resolved target during successful finalization", async () => {
    await createAuditedActionRunner(store)(
      { ...options, target: { type: "role" } },
      async () => "team_lead",
      undefined,
      (roleId) => ({ id: roleId, type: "role" })
    );

    expect(store.finalize).toHaveBeenCalledWith(expect.any(String), "success", {
      id: "team_lead",
      type: "role",
    });
  });

  it("merges counts known only after the action into the final metadata", async () => {
    await createAuditedActionRunner(store)(
      { ...options, metadata: { requestedCount: 3 } },
      async () => ({ issued: 2 }),
      undefined,
      undefined,
      (result) => ({ issuedCount: result.issued })
    );
    expect(store.finalize).toHaveBeenCalledWith(
      expect.any(String),
      "success",
      undefined,
      { issuedCount: 2, requestedCount: 3 }
    );
  });

  it("retries finalization and leaves pending when it cannot finish", async () => {
    store.finalize.mockRejectedValue(new Error("database unavailable"));

    await expect(
      createAuditedActionRunner(store)(options, async () => "done")
    ).rejects.toBeInstanceOf(AuditFinalizationError);
    expect(store.finalize).toHaveBeenCalledTimes(3);
  });
});

describe("Zero mutation audit boundary", () => {
  it("inserts success after execution using the supplied transaction writer", async () => {
    const order: string[] = [];
    const result = await runZeroAuditedMutation(
      options,
      () => {
        order.push("execute");
        return Promise.resolve("done");
      },
      (entry) => {
        order.push("audit");
        expect(entry.outcome).toBe("success");
        return Promise.resolve();
      }
    );

    expect(result).toBe("done");
    expect(order).toEqual(["execute", "audit"]);
  });

  it("records denial separately and preserves the mutation error", async () => {
    const error = new Error("Forbidden");
    const insertFailure = mock(async () => undefined);

    await expect(
      runZeroAuditedMutation(
        options,
        () => Promise.reject(error),
        mock(async () => undefined),
        insertFailure
      )
    ).rejects.toBe(error);
    expect(insertFailure).toHaveBeenCalledWith(options, "denied");
  });
});

describe("classifyAuditError", () => {
  it("distinguishes authorization denials from failures", () => {
    expect(classifyAuditError(new Error("Unauthorized"))).toBe("denied");
    expect(classifyAuditError(new Error("Forbidden"))).toBe("denied");
    expect(classifyAuditError(new Error("Service unavailable"))).toBe(
      "failure"
    );
  });

  it("classifies HTTP authorization and operational responses", () => {
    expect(classifyAuditResponse(new Response(null, { status: 204 }))).toBe(
      "success"
    );
    expect(classifyAuditResponse(new Response(null, { status: 403 }))).toBe(
      "denied"
    );
    expect(classifyAuditResponse(new Response(null, { status: 500 }))).toBe(
      "failure"
    );
  });
});
