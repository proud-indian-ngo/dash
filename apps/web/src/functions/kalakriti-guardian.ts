import type { auth } from "@pi-dash/auth";
import {
  createKalakritiExternalUser,
  deleteKalakritiExternalUser,
  setKalakritiExternalUserBlocked,
} from "@pi-dash/auth/kalakriti-external-user";
import { db } from "@pi-dash/db";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiAssignment,
  kalakritiAuditEntry,
  kalakritiCenter,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiExternalIdentity,
  kalakritiGuardianCenter,
} from "@pi-dash/db/schema/kalakriti";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { withFireAndForgetLog } from "@pi-dash/observability";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { uuidv7 } from "uuidv7";
import z from "zod";
import {
  decideGuardianIdentity,
  shouldBlockExternalIdentity,
} from "@/lib/kalakriti-guardian-policy";
import { authMiddleware } from "@/middleware/auth";

const MIN_PASSWORD_LENGTH = 10;

const guardianInviteSchema = z.object({
  confirmReuse: z.boolean().default(false),
  editionId: z.uuid(),
  email: z.email("Enter a valid email address"),
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  password: z
    .string()
    .max(128)
    .optional()
    .refine(
      (value) => !value || value.length >= MIN_PASSWORD_LENGTH,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
    ),
  phone: z.string().trim().max(32).optional(),
});

const archiveGuardianSchema = z.object({
  membershipId: z.uuid(),
});

const assignGuardianCenterSchema = z.object({
  centerId: z.uuid(),
  membershipId: z.uuid(),
});

const removeGuardianCenterSchema = z.object({
  guardianCenterId: z.uuid(),
});

interface AuthenticatedContext {
  headers: Headers;
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
}

async function requireGuardianAdmin(
  context: {
    headers: Headers;
    session: Awaited<ReturnType<typeof auth.api.getSession>>;
  },
  editionId: string
): Promise<AuthenticatedContext> {
  if (!context.session) {
    throw new Error("Unauthorized");
  }
  const permissions = await resolvePermissions(
    context.session.user.role ?? "unoriented_volunteer"
  );
  if (permissions.includes("kalakriti.admin")) {
    return context as AuthenticatedContext;
  }
  if (!permissions.includes("kalakriti.view")) {
    throw new Error("Forbidden");
  }

  const editionAdmin = await db
    .select({ id: kalakritiAssignment.id })
    .from(kalakritiAssignment)
    .innerJoin(
      kalakritiEditionMembership,
      eq(kalakritiEditionMembership.id, kalakritiAssignment.membershipId)
    )
    .where(
      and(
        eq(kalakritiEditionMembership.editionId, editionId),
        eq(kalakritiEditionMembership.userId, context.session.user.id),
        eq(kalakritiEditionMembership.state, "active"),
        eq(kalakritiAssignment.responsibility, "edition_admin")
      )
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (!editionAdmin) {
    throw new Error("Forbidden");
  }
  return context as AuthenticatedContext;
}

function insertGuardianMembership({
  actorUserId,
  editionId,
  email,
  name,
  phone,
  userId,
  action,
}: {
  action:
    | "guardian.assigned_existing"
    | "guardian.invited"
    | "guardian.reactivated";
  actorUserId: string;
  editionId: string;
  email: string;
  name: string;
  phone: string | null;
  userId: string;
}): Promise<string> {
  return db.transaction((tx) =>
    insertGuardianMembershipRecords(tx, {
      action,
      actorUserId,
      editionId,
      email,
      name,
      phone,
      userId,
    })
  );
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertGuardianMembershipRecords(
  tx: DbTransaction,
  {
    actorUserId,
    editionId,
    email,
    name,
    phone,
    userId,
    action,
  }: {
    action:
      | "guardian.assigned_existing"
      | "guardian.invited"
      | "guardian.reactivated";
    actorUserId: string;
    editionId: string;
    email: string;
    name: string;
    phone: string | null;
    userId: string;
  }
): Promise<string> {
  const membershipId = uuidv7();
  const now = new Date();
  await tx.insert(kalakritiEditionMembership).values({
    createdAt: now,
    createdBy: actorUserId,
    editionId,
    id: membershipId,
    kind: "guardian",
    snapshotEmail: email,
    snapshotName: name,
    snapshotPhone: phone,
    state: "active",
    updatedAt: now,
    userId,
  });
  await tx.insert(kalakritiAuditEntry).values({
    action,
    actorUserId,
    createdAt: now,
    domain: "guardian_access",
    editionId,
    id: uuidv7(),
    metadata: { email, name },
    targetId: membershipId,
    targetType: "edition_membership",
  });
  return membershipId;
}

function enqueueGuardianAccessNotification({
  editionName,
  membershipId,
  reusedIdentity,
  userId,
  year,
}: {
  editionName: string;
  membershipId: string;
  reusedIdentity: boolean;
  userId: string;
  year: number;
}) {
  withFireAndForgetLog(
    {
      editionName,
      handler: "inviteGuardian:notifyAccess",
      membershipId,
      reusedIdentity,
      userId,
      year,
    },
    async () => {
      await enqueue("notify-kalakriti-guardian-access", {
        editionName,
        membershipId,
        reusedIdentity,
        userId,
        year,
      });
    }
  );
}

type GuardianInviteData = z.infer<typeof guardianInviteSchema>;
type IdentityDecision = ReturnType<typeof decideGuardianIdentity>;

interface ExistingGuardianIdentity {
  banned: boolean | null;
  emailVerified: boolean;
  id: string;
  markerUserId: string | null;
  name: string;
  role: string;
}

async function handleExistingGuardianIdentity({
  authed,
  data,
  decision,
  edition,
  existing,
  normalizedEmail,
  normalizedPhone,
}: {
  authed: AuthenticatedContext;
  data: GuardianInviteData;
  decision: IdentityDecision;
  edition: { name: string; year: number };
  existing: ExistingGuardianIdentity;
  normalizedEmail: string;
  normalizedPhone: string | null;
}) {
  if (decision === "require_reuse_confirmation") {
    return {
      existingName: existing.name,
      status: "requires_confirmation" as const,
    };
  }

  if (decision === "reactivate_external") {
    const membershipId = await db.transaction(async (tx) => {
      const marker = await tx
        .select({ userId: kalakritiExternalIdentity.userId })
        .from(kalakritiExternalIdentity)
        .where(eq(kalakritiExternalIdentity.userId, existing.id))
        .for("update")
        .then((rows) => rows[0]);
      if (!marker) {
        throw new Error("Kalakriti external identity not found");
      }
      const memberships = await tx
        .select({
          editionId: kalakritiEditionMembership.editionId,
          state: kalakritiEditionMembership.state,
        })
        .from(kalakritiEditionMembership)
        .where(eq(kalakritiEditionMembership.userId, existing.id));
      if (
        memberships.some(
          (membership) => membership.editionId === data.editionId
        )
      ) {
        throw new Error(
          "This account already has a membership in this Edition"
        );
      }
      if (memberships.some((membership) => membership.state === "active")) {
        throw new Error(
          "This Guardian already has access to an active Kalakriti Edition"
        );
      }
      const createdMembershipId = await insertGuardianMembershipRecords(tx, {
        action: "guardian.reactivated",
        actorUserId: authed.session.user.id,
        editionId: data.editionId,
        email: normalizedEmail,
        name: data.name,
        phone: normalizedPhone,
        userId: existing.id,
      });
      await setKalakritiExternalUserBlocked(tx, {
        blocked: false,
        userId: existing.id,
      });
      return createdMembershipId;
    });
    enqueueGuardianAccessNotification({
      editionName: edition.name,
      membershipId,
      reusedIdentity: true,
      userId: existing.id,
      year: edition.year,
    });
    return { membershipId, status: "reactivated" as const };
  }

  if (decision !== "assign_central") {
    throw new Error("Guardian identity resolution failed");
  }
  const membershipId = await insertGuardianMembership({
    action: "guardian.assigned_existing",
    actorUserId: authed.session.user.id,
    editionId: data.editionId,
    email: normalizedEmail,
    name: data.name,
    phone: normalizedPhone,
    userId: existing.id,
  });
  enqueueGuardianAccessNotification({
    editionName: edition.name,
    membershipId,
    reusedIdentity: true,
    userId: existing.id,
    year: edition.year,
  });
  return { membershipId, status: "assigned_existing" as const };
}

async function createExternalGuardianIdentity({
  authed,
  data,
  edition,
  normalizedEmail,
  normalizedPhone,
  password,
}: {
  authed: AuthenticatedContext;
  data: GuardianInviteData;
  edition: { name: string; year: number };
  normalizedEmail: string;
  normalizedPhone: string | null;
  password: string;
}) {
  const requestLog = createRequestLogger({
    method: "POST",
    path: "inviteKalakritiGuardian",
  });
  requestLog.set({
    editionId: data.editionId,
    email: normalizedEmail,
    handler: "inviteKalakritiGuardian",
    userId: authed.session.user.id,
  });
  let createdUserId: string | undefined;
  try {
    const created = await createKalakritiExternalUser({
      email: normalizedEmail,
      name: data.name,
      password,
      phone: normalizedPhone,
    });
    createdUserId = created.id;

    const membershipId = await db.transaction(async (tx) => {
      await tx.insert(kalakritiExternalIdentity).values({
        createdAt: new Date(),
        createdBy: authed.session.user.id,
        userId: created.id,
      });
      return insertGuardianMembershipRecords(tx, {
        action: "guardian.invited",
        actorUserId: authed.session.user.id,
        editionId: data.editionId,
        email: normalizedEmail,
        name: data.name,
        phone: normalizedPhone,
        userId: created.id,
      });
    });
    enqueueGuardianAccessNotification({
      editionName: edition.name,
      membershipId,
      reusedIdentity: false,
      userId: createdUserId,
      year: edition.year,
    });
    requestLog.set({ createdUserId, membershipId, outcome: "created" });
    requestLog.emit();
    return { membershipId, status: "created" as const };
  } catch (caughtError) {
    if (createdUserId) {
      try {
        await deleteKalakritiExternalUser(createdUserId);
      } catch (cleanupError) {
        requestLog.set({
          cleanupError:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
          createdUserId,
        });
      }
    }
    requestLog.error(
      caughtError instanceof Error ? caughtError : String(caughtError)
    );
    requestLog.emit();
    throw caughtError;
  }
}

export const inviteKalakritiGuardian = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(guardianInviteSchema)
  .handler(async ({ context, data }) => {
    const authed = await requireGuardianAdmin(context, data.editionId);
    const normalizedEmail = data.email.trim().toLowerCase();
    const normalizedPhone = data.phone?.trim() || null;
    const edition = await db
      .select({ name: kalakritiEdition.name, year: kalakritiEdition.year })
      .from(kalakritiEdition)
      .where(eq(kalakritiEdition.id, data.editionId))
      .limit(1)
      .then((rows) => rows[0]);
    if (!edition) {
      throw new Error("Kalakriti Edition not found");
    }

    const existing = await db
      .select({
        banned: user.banned,
        emailVerified: user.emailVerified,
        id: user.id,
        markerUserId: kalakritiExternalIdentity.userId,
        name: user.name,
        role: user.role,
      })
      .from(user)
      .leftJoin(
        kalakritiExternalIdentity,
        eq(kalakritiExternalIdentity.userId, user.id)
      )
      .where(sql`lower(${user.email}) = ${normalizedEmail}`)
      .limit(1)
      .then((rows) => rows[0]);

    const [sameEditionMembership, activeMembership] = existing
      ? await Promise.all([
          db
            .select({ id: kalakritiEditionMembership.id })
            .from(kalakritiEditionMembership)
            .where(
              and(
                eq(kalakritiEditionMembership.editionId, data.editionId),
                eq(kalakritiEditionMembership.userId, existing.id)
              )
            )
            .limit(1)
            .then((rows) => rows[0]),
          db
            .select({ id: kalakritiEditionMembership.id })
            .from(kalakritiEditionMembership)
            .where(
              and(
                eq(kalakritiEditionMembership.userId, existing.id),
                eq(kalakritiEditionMembership.state, "active")
              )
            )
            .limit(1)
            .then((rows) => rows[0]),
        ])
      : [undefined, undefined];
    const existingPermissions = existing
      ? await resolvePermissions(existing.role)
      : [];
    const decision = decideGuardianIdentity({
      candidate: existing
        ? {
            banned: existing.banned,
            canAccessKalakriti: existingPermissions.includes("kalakriti.view"),
            emailVerified: existing.emailVerified,
            hasActiveMembership: Boolean(activeMembership),
            hasEditionMembership: Boolean(sameEditionMembership),
            isExternal: Boolean(existing.markerUserId),
            role: existing.role,
          }
        : null,
      confirmReuse: data.confirmReuse,
      hasPassword: Boolean(data.password),
    });

    if (existing) {
      return handleExistingGuardianIdentity({
        authed,
        data,
        decision,
        edition,
        existing,
        normalizedEmail,
        normalizedPhone,
      });
    }
    if (decision !== "create_external" || !data.password) {
      throw new Error("Guardian identity resolution failed");
    }
    return createExternalGuardianIdentity({
      authed,
      data,
      edition,
      normalizedEmail,
      normalizedPhone,
      password: data.password,
    });
  });

export const archiveKalakritiGuardian = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(archiveGuardianSchema)
  .handler(async ({ context, data }) => {
    const membership = await db
      .select({
        editionId: kalakritiEditionMembership.editionId,
        kind: kalakritiEditionMembership.kind,
        name: kalakritiEditionMembership.snapshotName,
        state: kalakritiEditionMembership.state,
        userId: kalakritiEditionMembership.userId,
      })
      .from(kalakritiEditionMembership)
      .where(eq(kalakritiEditionMembership.id, data.membershipId))
      .limit(1)
      .then((rows) => rows[0]);
    if (membership?.kind !== "guardian") {
      throw new Error("Guardian membership not found");
    }
    const authed = await requireGuardianAdmin(context, membership.editionId);
    if (membership.state !== "active") {
      throw new Error("Guardian membership is already archived");
    }
    const membershipUserId = membership.userId;

    const auditEntryId = uuidv7();
    const now = new Date();
    await db.transaction(async (tx) => {
      const marker = membershipUserId
        ? await tx
            .select({ userId: kalakritiExternalIdentity.userId })
            .from(kalakritiExternalIdentity)
            .where(eq(kalakritiExternalIdentity.userId, membershipUserId))
            .for("update")
            .then((rows) => rows[0])
        : undefined;
      const currentMembership = await tx
        .select({
          name: kalakritiEditionMembership.snapshotName,
          state: kalakritiEditionMembership.state,
          userId: kalakritiEditionMembership.userId,
        })
        .from(kalakritiEditionMembership)
        .where(eq(kalakritiEditionMembership.id, data.membershipId))
        .for("update")
        .then((rows) => rows[0]);
      if (
        currentMembership?.state !== "active" ||
        currentMembership.userId !== membershipUserId
      ) {
        throw new Error("Guardian membership is already archived");
      }
      const removedCenterAssignments = await tx
        .delete(kalakritiGuardianCenter)
        .where(eq(kalakritiGuardianCenter.membershipId, data.membershipId))
        .returning({ id: kalakritiGuardianCenter.id });
      await tx
        .update(kalakritiEditionMembership)
        .set({ archivedAt: now, state: "archived", updatedAt: now })
        .where(eq(kalakritiEditionMembership.id, data.membershipId));
      await tx.insert(kalakritiAuditEntry).values({
        action: "guardian.archived",
        actorUserId: authed.session.user.id,
        createdAt: now,
        domain: "guardian_access",
        editionId: membership.editionId,
        id: auditEntryId,
        metadata: {
          centerAssignmentCount: removedCenterAssignments.length,
          name: currentMembership.name,
        },
        targetId: data.membershipId,
        targetType: "edition_membership",
      });
      if (!membershipUserId) {
        return;
      }
      const otherActiveMembership = marker
        ? await tx
            .select({ id: kalakritiEditionMembership.id })
            .from(kalakritiEditionMembership)
            .where(
              and(
                eq(kalakritiEditionMembership.userId, membershipUserId),
                eq(kalakritiEditionMembership.state, "active")
              )
            )
            .limit(1)
            .then((rows) => rows[0])
        : undefined;
      if (
        shouldBlockExternalIdentity({
          hasExternalMarker: Boolean(marker),
          hasOtherActiveMembership: Boolean(otherActiveMembership),
        })
      ) {
        await setKalakritiExternalUserBlocked(tx, {
          blocked: true,
          userId: membershipUserId,
        });
      }
    });
    return { membershipId: data.membershipId, status: "archived" as const };
  });

export const assignKalakritiGuardianCenter = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(assignGuardianCenterSchema)
  .handler(async ({ context, data }) => {
    const membership = await db.query.kalakritiEditionMembership.findFirst({
      columns: { editionId: true },
      where: (table, operators) => operators.eq(table.id, data.membershipId),
    });
    if (!membership) {
      throw new Error("Guardian membership not found");
    }
    const authed = await requireGuardianAdmin(context, membership.editionId);

    return db.transaction(async (tx) => {
      const lockedMembership = await tx
        .select({
          editionId: kalakritiEditionMembership.editionId,
          kind: kalakritiEditionMembership.kind,
          state: kalakritiEditionMembership.state,
        })
        .from(kalakritiEditionMembership)
        .where(eq(kalakritiEditionMembership.id, data.membershipId))
        .for("update")
        .then((rows) => rows[0]);
      if (
        !lockedMembership ||
        lockedMembership.editionId !== membership.editionId ||
        lockedMembership.kind !== "guardian" ||
        lockedMembership.state !== "active"
      ) {
        throw new Error("Active Guardian membership not found");
      }
      const center = await tx
        .select({
          editionId: kalakritiCenter.editionId,
          retiredAt: kalakritiCenter.retiredAt,
        })
        .from(kalakritiCenter)
        .where(eq(kalakritiCenter.id, data.centerId))
        .for("update")
        .then((rows) => rows[0]);
      if (!(center && center.editionId === membership.editionId)) {
        throw new Error("Center not found in this Edition");
      }
      if (center.retiredAt) {
        throw new Error("Retired Centers cannot receive assignments");
      }
      const existing = await tx
        .select({ id: kalakritiGuardianCenter.id })
        .from(kalakritiGuardianCenter)
        .where(
          and(
            eq(kalakritiGuardianCenter.membershipId, data.membershipId),
            eq(kalakritiGuardianCenter.centerId, data.centerId)
          )
        )
        .limit(1)
        .then((rows) => rows[0]);
      if (existing) {
        throw new Error("Guardian is already assigned to this Center");
      }

      const guardianCenterId = uuidv7();
      const now = new Date();
      await tx.insert(kalakritiGuardianCenter).values({
        centerId: data.centerId,
        createdAt: now,
        createdBy: authed.session.user.id,
        editionId: membership.editionId,
        id: guardianCenterId,
        membershipId: data.membershipId,
      });
      await tx.insert(kalakritiAuditEntry).values({
        action: "assigned",
        actorUserId: authed.session.user.id,
        createdAt: now,
        domain: "guardian_center_assignment",
        editionId: membership.editionId,
        id: uuidv7(),
        metadata: {
          centerId: data.centerId,
          membershipId: data.membershipId,
        },
        targetId: guardianCenterId,
        targetType: "guardian_center",
      });
      return { guardianCenterId };
    });
  });

export const removeKalakritiGuardianCenter = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(removeGuardianCenterSchema)
  .handler(async ({ context, data }) => {
    const assignment = await db.query.kalakritiGuardianCenter.findFirst({
      columns: { editionId: true },
      where: (table, operators) =>
        operators.eq(table.id, data.guardianCenterId),
    });
    if (!assignment) {
      throw new Error("Guardian Center assignment not found");
    }
    const authed = await requireGuardianAdmin(context, assignment.editionId);

    return db.transaction(async (tx) => {
      const lockedAssignment = await tx
        .select({
          centerId: kalakritiGuardianCenter.centerId,
          editionId: kalakritiGuardianCenter.editionId,
          membershipId: kalakritiGuardianCenter.membershipId,
        })
        .from(kalakritiGuardianCenter)
        .where(eq(kalakritiGuardianCenter.id, data.guardianCenterId))
        .for("update")
        .then((rows) => rows[0]);
      if (
        !lockedAssignment ||
        lockedAssignment.editionId !== assignment.editionId
      ) {
        throw new Error("Guardian Center assignment not found");
      }

      await tx
        .delete(kalakritiGuardianCenter)
        .where(eq(kalakritiGuardianCenter.id, data.guardianCenterId));
      await tx.insert(kalakritiAuditEntry).values({
        action: "removed",
        actorUserId: authed.session.user.id,
        createdAt: new Date(),
        domain: "guardian_center_assignment",
        editionId: assignment.editionId,
        id: uuidv7(),
        metadata: {
          centerId: lockedAssignment.centerId,
          membershipId: lockedAssignment.membershipId,
        },
        targetId: data.guardianCenterId,
        targetType: "guardian_center",
      });
      return { removed: true };
    });
  });
