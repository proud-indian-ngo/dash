import { describe, expect, it, mock } from "bun:test";

import type { Context } from "../../context";
import { eventInterestMutators } from "../event-interest";
import { orientEnrolledKalakritiVolunteer } from "../kalakriti-orientation";
import { ensureUnassignedVolunteerEnrollment } from "../kalakriti-volunteer-enroll";
import { createOrientationSql } from "./orientation-tx";

function setup(promoted = true) {
  const sql = createOrientationSql(promoted);
  const ctx: Context = {
    userId: "admin-1",
    role: "admin",
    permissions: ["kalakriti.admin"],
    asyncTasks: [],
  };
  return {
    sql,
    ctx,
    tx: {
      location: "server" as const,
      dbTransaction: { wrappedTransaction: sql.transaction },
    },
  };
}

const args = {
  actorUserId: "admin-1",
  credentialId: "credential-1",
  credentialTokenHash: "a".repeat(64),
  edition: { id: "edition-1", lifecycle: "draft", teamEventId: "event-1" },
  membershipId: "membership-1",
  now: 1234,
  teamEventMemberId: "member-1",
  user: { email: null, name: "Volunteer", phone: null },
  userId: "volunteer-1",
};

describe("Kalakriti orientation", () => {
  for (const failure of [
    "archived",
    "missing-edition",
    "missing-user",
    "inactive",
    "external-role",
    "external-marker",
    "guardian",
    "cancelled",
  ] as const) {
    it(`fails closed on ${failure} Kalakriti interest approval`, async () => {
      const { tx, ctx, sql } = setup();
      const write = mock();
      const results = [
        {
          id: "interest-1",
          eventId: "event-1",
          userId: args.userId,
          status: "pending",
        },
        {
          id: "event-1",
          teamId: "team-1",
          managementDomain: "kalakriti",
          cancelledAt: failure === "cancelled" ? args.now : null,
        },
        { id: "team-lead" },
        failure === "missing-edition"
          ? undefined
          : {
              ...args.edition,
              lifecycle: failure === "archived" ? "archived" : "draft",
            },
        failure === "missing-user"
          ? undefined
          : {
              ...args.user,
              isActive: failure !== "inactive",
              role:
                failure === "external-role"
                  ? "external_user"
                  : "unoriented_volunteer",
            },
        failure === "external-marker" ? { userId: args.userId } : undefined,
        failure === "guardian"
          ? { id: "guardian-1", kind: "guardian", state: "active" }
          : undefined,
      ];
      await expect(
        eventInterestMutators.approve.fn({
          args: { id: "interest-1", now: args.now },
          ctx,
          tx: {
            ...tx,
            run: mock(async () => results.shift()),
            mutate: {
              eventInterest: { update: write },
              teamEventMember: { insert: write },
              kalakritiEditionMembership: { insert: write, update: write },
            },
          },
        } as unknown as Parameters<typeof eventInterestMutators.approve.fn>[0])
      ).rejects.toThrow();
      expect(write).not.toHaveBeenCalled();
      expect(sql.returning).not.toHaveBeenCalled();
      expect(ctx.asyncTasks).toHaveLength(0);
    });
  }

  for (const status of ["approved", "rejected"] as const) {
    it(`does not promote a replayed ${status} interest`, async () => {
      const { tx, ctx, sql } = setup();
      await expect(
        eventInterestMutators.approve.fn({
          args: { id: "interest-1", now: args.now },
          ctx,
          tx: { ...tx, run: mock(async () => ({ status })) },
        } as unknown as Parameters<typeof eventInterestMutators.approve.fn>[0])
      ).rejects.toThrow("Interest is not pending");
      expect(sql.returning).not.toHaveBeenCalled();
      expect(ctx.asyncTasks).toHaveLength(0);
    });
  }

  it("does not orient an approved unrelated event enrollment", async () => {
    const { tx, ctx, sql } = setup();
    const results = [
      {
        id: "interest-1",
        eventId: "event-1",
        userId: args.userId,
        status: "pending",
      },
      { id: "event-1", teamId: "team-1", name: "Other event" },
      { id: "team-lead" },
      undefined,
      undefined,
    ];
    await eventInterestMutators.approve.fn({
      args: { id: "interest-1", now: args.now },
      ctx,
      tx: {
        ...tx,
        run: mock(async () => results.shift()),
        mutate: {
          eventInterest: { update: mock() },
          teamEventMember: { insert: mock() },
        },
      },
    } as unknown as Parameters<typeof eventInterestMutators.approve.fn>[0]);
    expect(sql.returning).not.toHaveBeenCalled();
    expect(
      ctx.asyncTasks?.some(
        (task) => task.meta.mutator === "orientEnrolledKalakritiVolunteer"
      )
    ).toBe(false);
  });
  it("queues independent postcommit effects only after SQL promotion and session deletion", async () => {
    const { tx, ctx, sql } = setup();
    await orientEnrolledKalakritiVolunteer(tx, ctx, args.userId, args.now);
    expect(sql.deleteWhere).toHaveBeenCalledTimes(1);
    expect(
      ctx.asyncTasks?.map((task) => task.meta.queueName ?? task.meta.effect)
    ).toEqual([
      "permissionCache",
      "notify-role-changed",
      "whatsapp-manage-orientation",
    ]);
  });

  it("does not repeat effects when the conditional update loses or is replayed", async () => {
    const { tx, ctx, sql } = setup();
    sql.returning
      .mockResolvedValueOnce([{ id: args.userId }])
      .mockResolvedValue([]);
    await orientEnrolledKalakritiVolunteer(tx, ctx, args.userId, args.now);
    await orientEnrolledKalakritiVolunteer(tx, ctx, args.userId, args.now);
    expect(sql.deleteWhere).toHaveBeenCalledTimes(1);
    expect(ctx.asyncTasks).toHaveLength(3);
  });

  it("queues nothing when SQL preserves the current role or excludes an identity", async () => {
    const { tx, ctx, sql } = setup(false);
    await orientEnrolledKalakritiVolunteer(tx, ctx, args.userId, args.now);
    expect(sql.deleteWhere).not.toHaveBeenCalled();
    expect(ctx.asyncTasks).toHaveLength(0);
  });

  it("never executes SQL on the client and fails closed without a server transaction", async () => {
    const { ctx } = setup();
    await orientEnrolledKalakritiVolunteer(
      { location: "client" },
      ctx,
      args.userId,
      args.now
    );
    await expect(
      orientEnrolledKalakritiVolunteer(
        { location: "server" },
        ctx,
        args.userId,
        args.now
      )
    ).rejects.toThrow("Server transaction is unavailable");
    expect(ctx.asyncTasks).toHaveLength(0);
  });

  it("propagates SQL/session failures without scheduling effects", async () => {
    for (const failingOperation of ["returning", "deleteWhere"] as const) {
      const { tx, ctx, sql } = setup();
      sql[failingOperation].mockRejectedValue(new Error("database failure"));
      await expect(
        orientEnrolledKalakritiVolunteer(tx, ctx, args.userId, args.now)
      ).rejects.toThrow("database failure");
      expect(ctx.asyncTasks).toHaveLength(0);
    }
  });

  for (const state of ["new", "active", "archived"] as const) {
    it(`orients after ${state} enrollment writes`, async () => {
      const { tx, ctx, sql } = setup();
      const insert = mock(async () => undefined);
      const update = mock(async () => undefined);
      const insertCredential = mock(async () => undefined);
      const results = [
        state === "new"
          ? undefined
          : { id: "membership-1", kind: "volunteer", state },
        ...(state === "archived" ? [undefined] : []),
        undefined,
        {
          editionId: "edition-1",
          humanId: state === "archived" ? "KALV-2027-00042" : null,
          id: "membership-1",
          state: "active",
        },
      ];
      await ensureUnassignedVolunteerEnrollment(
        {
          ...tx,
          run: mock(async () => results.shift()),
          mutate: {
            kalakritiCredential: { insert: insertCredential, update },
            kalakritiEdition: { update },
            kalakritiEditionMembership: { insert, update },
            teamEventMember: { insert },
          },
        },
        args,
        ctx
      );
      expect(sql.returning).toHaveBeenCalledTimes(1);
      expect(ctx.asyncTasks).toHaveLength(3);
      expect(insertCredential).toHaveBeenCalledTimes(
        state === "active" ? 0 : 1
      );
      if (state !== "active") {
        expect(insertCredential).toHaveBeenCalledWith(
          expect.objectContaining({
            id: args.credentialId,
            membershipId: args.membershipId,
            tokenHash: args.credentialTokenHash,
            humanId:
              state === "archived" ? "KALV-2027-00042" : "KALV-2027-0001",
          })
        );
      }
    });
  }

  it("rejects guardians before promotion", async () => {
    const { tx, ctx, sql } = setup();
    const insert = mock();
    await expect(
      ensureUnassignedVolunteerEnrollment(
        {
          ...tx,
          run: mock(async () => ({
            id: "guardian-1",
            kind: "guardian",
            state: "active",
          })),
          mutate: {
            kalakritiCredential: { insert, update: mock() },
            kalakritiEdition: { update: mock() },
            kalakritiEditionMembership: { insert, update: mock() },
            teamEventMember: { insert },
          },
        },
        args,
        ctx
      )
    ).rejects.toThrow("Guardian memberships");
    expect(sql.returning).not.toHaveBeenCalled();
    expect(ctx.asyncTasks).toHaveLength(0);
  });
});
