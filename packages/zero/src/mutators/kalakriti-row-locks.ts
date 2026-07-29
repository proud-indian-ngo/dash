import type { db } from "@pi-dash/db";
import type { DrizzleTransaction } from "@rocicorp/zero/server/adapters/drizzle";
import { zql } from "../schema";

abstract class BivariantZeroRun {
  abstract bivarianceHack(query: unknown): Promise<unknown>;
}

type ZeroRunFn = BivariantZeroRun["bivarianceHack"];

export interface LockableKalakritiTx {
  dbTransaction?: {
    wrappedTransaction: unknown;
  };
  location: "client" | "server";
  run: ZeroRunFn;
}

export interface LockedCenter {
  competitionEntryRegistrationEnabled: boolean;
  editionId: string;
  id: string;
  retiredAt: number | null;
  studentRegistrationEnabled: boolean;
}

export interface LockedEdition {
  id: string;
  lifecycle: string;
}

export interface LockedAgeCategory {
  editionId: string;
  id: string;
  maximumAge: number;
  minimumAge: number;
  name: string;
}

export interface LockedEditionMembership {
  editionId: string;
  id: string;
  kind: "guardian" | "volunteer";
  state: "active" | "archived";
}

export interface LockedGuardianCenter {
  centerId: string;
  editionId: string;
  id: string;
  membershipId: string;
}

function requireServerTransaction(tx: LockableKalakritiTx) {
  const transaction = tx.dbTransaction?.wrappedTransaction;
  if (!transaction) {
    throw new Error("Server transaction is unavailable");
  }
  return transaction as DrizzleTransaction<typeof db>;
}

function normalizeCenter(center: {
  competitionEntryRegistrationEnabled: boolean;
  editionId: string;
  id: string;
  retiredAt: Date | null;
  studentRegistrationEnabled: boolean;
}): LockedCenter {
  return {
    ...center,
    retiredAt: center.retiredAt?.getTime() ?? null,
  };
}

export async function getCenterForUpdate(
  tx: LockableKalakritiTx,
  centerId: string
): Promise<LockedCenter | undefined> {
  if (tx.location === "client") {
    return (await tx.run(zql.kalakritiCenter.where("id", centerId).one())) as
      | LockedCenter
      | undefined;
  }

  const [{ kalakritiCenter }, { eq }] = await Promise.all([
    import("@pi-dash/db/schema/kalakriti"),
    import("drizzle-orm"),
  ]);
  const [center] = await requireServerTransaction(tx)
    .select({
      competitionEntryRegistrationEnabled:
        kalakritiCenter.competitionEntryRegistrationEnabled,
      editionId: kalakritiCenter.editionId,
      id: kalakritiCenter.id,
      retiredAt: kalakritiCenter.retiredAt,
      studentRegistrationEnabled: kalakritiCenter.studentRegistrationEnabled,
    })
    .from(kalakritiCenter)
    .where(eq(kalakritiCenter.id, centerId))
    .for("update");
  return center ? normalizeCenter(center) : undefined;
}

export async function getEditionForUpdate(
  tx: LockableKalakritiTx,
  editionId: string
): Promise<LockedEdition | undefined> {
  if (tx.location === "client") {
    return (await tx.run(zql.kalakritiEdition.where("id", editionId).one())) as
      | LockedEdition
      | undefined;
  }

  const [{ kalakritiEdition }, { eq }] = await Promise.all([
    import("@pi-dash/db/schema/kalakriti"),
    import("drizzle-orm"),
  ]);
  const [edition] = await requireServerTransaction(tx)
    .select({ id: kalakritiEdition.id, lifecycle: kalakritiEdition.lifecycle })
    .from(kalakritiEdition)
    .where(eq(kalakritiEdition.id, editionId))
    .for("update");
  return edition;
}

export async function getAgeCategoryForUpdate(
  tx: LockableKalakritiTx,
  ageCategoryId: string
): Promise<LockedAgeCategory | undefined> {
  if (tx.location === "client") {
    return (await tx.run(
      zql.kalakritiAgeCategory.where("id", ageCategoryId).one()
    )) as LockedAgeCategory | undefined;
  }

  const [{ kalakritiAgeCategory }, { eq }] = await Promise.all([
    import("@pi-dash/db/schema/kalakriti"),
    import("drizzle-orm"),
  ]);
  const [category] = await requireServerTransaction(tx)
    .select({
      editionId: kalakritiAgeCategory.editionId,
      id: kalakritiAgeCategory.id,
      maximumAge: kalakritiAgeCategory.maximumAge,
      minimumAge: kalakritiAgeCategory.minimumAge,
      name: kalakritiAgeCategory.name,
    })
    .from(kalakritiAgeCategory)
    .where(eq(kalakritiAgeCategory.id, ageCategoryId))
    .for("update");
  return category;
}

export async function getEditionAgeCategoriesForUpdate(
  tx: LockableKalakritiTx,
  editionId: string
): Promise<LockedAgeCategory[]> {
  if (tx.location === "client") {
    return (await tx.run(
      zql.kalakritiAgeCategory.where("editionId", editionId)
    )) as LockedAgeCategory[];
  }

  const [{ kalakritiAgeCategory }, { eq }] = await Promise.all([
    import("@pi-dash/db/schema/kalakriti"),
    import("drizzle-orm"),
  ]);
  return requireServerTransaction(tx)
    .select({
      editionId: kalakritiAgeCategory.editionId,
      id: kalakritiAgeCategory.id,
      maximumAge: kalakritiAgeCategory.maximumAge,
      minimumAge: kalakritiAgeCategory.minimumAge,
      name: kalakritiAgeCategory.name,
    })
    .from(kalakritiAgeCategory)
    .where(eq(kalakritiAgeCategory.editionId, editionId))
    .orderBy(kalakritiAgeCategory.id)
    .for("update");
}

export async function getEditionCentersForUpdate(
  tx: LockableKalakritiTx,
  editionId: string
): Promise<LockedCenter[]> {
  if (tx.location === "client") {
    return (await tx.run(
      zql.kalakritiCenter.where("editionId", editionId)
    )) as LockedCenter[];
  }

  const [{ kalakritiCenter }, { eq }] = await Promise.all([
    import("@pi-dash/db/schema/kalakriti"),
    import("drizzle-orm"),
  ]);
  const centers = await requireServerTransaction(tx)
    .select({
      competitionEntryRegistrationEnabled:
        kalakritiCenter.competitionEntryRegistrationEnabled,
      editionId: kalakritiCenter.editionId,
      id: kalakritiCenter.id,
      retiredAt: kalakritiCenter.retiredAt,
      studentRegistrationEnabled: kalakritiCenter.studentRegistrationEnabled,
    })
    .from(kalakritiCenter)
    .where(eq(kalakritiCenter.editionId, editionId))
    .orderBy(kalakritiCenter.id)
    .for("update");
  return centers.map(normalizeCenter);
}

export async function getEditionMembershipForUpdate(
  tx: LockableKalakritiTx,
  membershipId: string
): Promise<LockedEditionMembership | undefined> {
  if (tx.location === "client") {
    return (await tx.run(
      zql.kalakritiEditionMembership.where("id", membershipId).one()
    )) as LockedEditionMembership | undefined;
  }

  const [{ kalakritiEditionMembership }, { eq }] = await Promise.all([
    import("@pi-dash/db/schema/kalakriti"),
    import("drizzle-orm"),
  ]);
  const [membership] = await requireServerTransaction(tx)
    .select({
      editionId: kalakritiEditionMembership.editionId,
      id: kalakritiEditionMembership.id,
      kind: kalakritiEditionMembership.kind,
      state: kalakritiEditionMembership.state,
    })
    .from(kalakritiEditionMembership)
    .where(eq(kalakritiEditionMembership.id, membershipId))
    .for("update");
  return membership;
}

export async function getGuardianCenterForUpdate(
  tx: LockableKalakritiTx,
  guardianCenterId: string
): Promise<LockedGuardianCenter | undefined> {
  if (tx.location === "client") {
    return (await tx.run(
      zql.kalakritiGuardianCenter.where("id", guardianCenterId).one()
    )) as LockedGuardianCenter | undefined;
  }

  const [{ kalakritiGuardianCenter }, { eq }] = await Promise.all([
    import("@pi-dash/db/schema/kalakriti"),
    import("drizzle-orm"),
  ]);
  const [assignment] = await requireServerTransaction(tx)
    .select({
      centerId: kalakritiGuardianCenter.centerId,
      editionId: kalakritiGuardianCenter.editionId,
      id: kalakritiGuardianCenter.id,
      membershipId: kalakritiGuardianCenter.membershipId,
    })
    .from(kalakritiGuardianCenter)
    .where(eq(kalakritiGuardianCenter.id, guardianCenterId))
    .for("update");
  return assignment;
}
