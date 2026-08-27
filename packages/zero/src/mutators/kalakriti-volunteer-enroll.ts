import type { Context } from "../context";
import { assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";

abstract class BivariantZeroMutation {
  abstract bivarianceHack(args: unknown): Promise<void>;
}

type ZeroMutationFn = BivariantZeroMutation["bivarianceHack"];

abstract class BivariantZeroRun {
  abstract bivarianceHack(query: unknown): Promise<unknown>;
}

type ZeroRunFn = BivariantZeroRun["bivarianceHack"];

export interface VolunteerEnrollTx {
  mutate: {
    kalakritiEditionMembership: {
      insert: ZeroMutationFn;
      update: ZeroMutationFn;
    };
    teamEventMember: {
      insert: ZeroMutationFn;
    };
  };
  run: ZeroRunFn;
}

export interface VolunteerEnrollEdition {
  id: string;
  lifecycle: string;
  teamEventId: string;
}

export interface VolunteerEnrollUser {
  email: string | null;
  name: string;
  phone: string | null;
}

interface VolunteerMembershipRow {
  id: string;
  kind: "guardian" | "volunteer";
  state: "active" | "archived";
}

export async function assertCanManageVolunteerRoster(
  tx: { run: ZeroRunFn },
  ctx: Context | undefined,
  editionId: string
): Promise<void> {
  assertIsLoggedIn(ctx);
  if (can(ctx, "kalakriti.admin")) {
    return;
  }

  const membership = (await tx.run(
    zql.kalakritiEditionMembership
      .where("editionId", editionId)
      .where("userId", ctx.userId)
      .where("state", "active")
      .one()
  )) as { id: string } | undefined;
  if (!membership) {
    throw new Error("Unauthorized");
  }

  const managerAssignment = await tx.run(
    zql.kalakritiAssignment
      .where("membershipId", membership.id)
      .where(({ or, cmp }) =>
        or(
          cmp("responsibility", "edition_admin"),
          cmp("responsibility", "volunteer_coordinator")
        )
      )
      .one()
  );
  if (!managerAssignment) {
    throw new Error("Unauthorized");
  }
}

export async function findEditionForLinkedEvent(
  tx: { run: ZeroRunFn },
  eventId: string
): Promise<VolunteerEnrollEdition | undefined> {
  return (await tx.run(
    zql.kalakritiEdition.where("teamEventId", eventId).one()
  )) as VolunteerEnrollEdition | undefined;
}

export async function ensureUnassignedVolunteerEnrollment(
  tx: VolunteerEnrollTx,
  args: {
    actorUserId: string;
    edition: VolunteerEnrollEdition;
    membershipId: string;
    now: number;
    teamEventMemberId: string;
    user: VolunteerEnrollUser;
    userId: string;
  }
): Promise<"already-active" | "enrolled"> {
  if (args.edition.lifecycle === "archived") {
    throw new Error("Edition is archived");
  }

  const membership = (await tx.run(
    zql.kalakritiEditionMembership
      .where("editionId", args.edition.id)
      .where("userId", args.userId)
      .one()
  )) as VolunteerMembershipRow | undefined;
  if (membership?.kind === "guardian") {
    throw new Error("Guardian memberships cannot receive volunteer roles");
  }

  const membershipId = membership ? membership.id : args.membershipId;
  if (!membership) {
    await tx.mutate.kalakritiEditionMembership.insert({
      archivedAt: null,
      createdAt: args.now,
      createdBy: args.actorUserId,
      editionId: args.edition.id,
      id: membershipId,
      kind: "volunteer",
      snapshotEmail: args.user.email,
      snapshotName: args.user.name,
      snapshotPhone: args.user.phone,
      state: "active",
      updatedAt: args.now,
      userId: args.userId,
    });
  } else if (membership.state === "archived") {
    await tx.mutate.kalakritiEditionMembership.update({
      archivedAt: null,
      id: membership.id,
      snapshotEmail: args.user.email,
      snapshotName: args.user.name,
      snapshotPhone: args.user.phone,
      state: "active",
      updatedAt: args.now,
    });
  }

  const eventMember = await tx.run(
    zql.teamEventMember
      .where("eventId", args.edition.teamEventId)
      .where("userId", args.userId)
      .one()
  );
  if (!eventMember) {
    await tx.mutate.teamEventMember.insert({
      addedAt: args.now,
      attendance: null,
      attendanceMarkedAt: null,
      attendanceMarkedBy: null,
      eventId: args.edition.teamEventId,
      id: args.teamEventMemberId,
      userId: args.userId,
    });
  }

  if (membership?.state === "active") {
    return eventMember ? "already-active" : "enrolled";
  }
  return "enrolled";
}
