import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("evlog", () => ({
  createRequestLogger: () => ({
    emit: vi.fn(),
    error: vi.fn(),
    set: vi.fn(),
  }),
}));

vi.mock("@pi-dash/db", () => ({ db: {} }));

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
const BETTER_AUTH_USER_ID = "0123456789abcdefghijklmnopqrstuv";
const options = {
  action: "user.update",
  actor: { name: "Admin", role: "super_admin", userId: "actor-1" },
  target: { id: TARGET_ID, type: "user" },
};

function makeStore(): AuditStore & {
  finalize: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
} {
  return {
    finalize: vi.fn(async () => undefined),
    insert: vi.fn(async () => undefined),
  };
}

describe("audit metadata", () => {
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

  it("resolves only canonical existing Better Auth IDs for Zero summaries", async () => {
    const unknownUserId = "abcdef0123456789abcdef0123456789";
    const resolveExisting = vi.fn(async () => new Set([BETTER_AUTH_USER_ID]));

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

  it("drops unknown session targets and propagates resolver failures", async () => {
    const unknown = vi.fn(async () => new Set<string>());
    await expect(
      resolveSessionAuditTarget(
        { id: BETTER_AUTH_USER_ID, type: "user" },
        "differentActorId000000000000000",
        unknown
      )
    ).resolves.toEqual({ type: "user" });

    const failure = vi.fn(() =>
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
    const resolveExisting = vi.fn(async () => new Set<string>());
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
    const resolveUsers = vi.fn(async () => new Set<string>());
    const resolveRoles = vi.fn(async () => new Set(["team_lead"]));

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
    const execute = vi.fn(async () => "done");
    const result = await createAuditedActionRunner(store)(options, execute);

    expect(result).toBe("done");
    expect(store.insert).toHaveBeenCalledOnce();
    expect(store.insert.mock.calls[0]?.[0].outcome).toBe("pending");
    expect(execute).toHaveBeenCalledOnce();
    expect(store.finalize).toHaveBeenCalledWith(expect.any(String), "success");
  });

  it("does not execute when the pending insert fails", async () => {
    store.insert.mockRejectedValueOnce(new Error("database unavailable"));
    const execute = vi.fn(async () => undefined);

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
    const insertFailure = vi.fn(async () => undefined);

    await expect(
      runZeroAuditedMutation(
        options,
        () => Promise.reject(error),
        vi.fn(async () => undefined),
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
