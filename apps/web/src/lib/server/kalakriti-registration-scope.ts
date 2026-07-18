import { db } from "@pi-dash/db";
import { kalakritiGuardianCenter } from "@pi-dash/db/schema/kalakriti";
import { and, eq } from "drizzle-orm";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { resolveKalakritiRegistrationScopes } from "@/lib/kalakriti-registration-scope-policy";
import { resolveKalakritiEditionAccess } from "@/lib/server/kalakriti-edition-access";

interface RegistrationScopeDependencies {
  loadGuardianCenterIds: (
    access: NonNullable<KalakritiEditionAccess>
  ) => Promise<string[]>;
  resolveAccess: (input: {
    role: string;
    userId: string;
    year: number;
  }) => Promise<KalakritiEditionAccess | null>;
}

const defaultDependencies: RegistrationScopeDependencies = {
  loadGuardianCenterIds: (access) => {
    if (access.membership?.kind !== "guardian") {
      return Promise.resolve([]);
    }
    return db
      .select({ centerId: kalakritiGuardianCenter.centerId })
      .from(kalakritiGuardianCenter)
      .where(
        and(
          eq(kalakritiGuardianCenter.editionId, access.edition.id),
          eq(kalakritiGuardianCenter.membershipId, access.membership.id)
        )
      )
      .then((rows) => rows.map(({ centerId }) => centerId));
  },
  resolveAccess: resolveKalakritiEditionAccess,
};

export async function resolveKalakritiRegistrationScope(
  {
    sessionUser,
    year,
  }: {
    sessionUser: { id: string; role?: string | null } | null;
    year: number;
  },
  dependencies: RegistrationScopeDependencies = defaultDependencies
) {
  if (!sessionUser) {
    return null;
  }
  const access = await dependencies.resolveAccess({
    role: sessionUser.role ?? "unoriented_volunteer",
    userId: sessionUser.id,
    year,
  });
  if (!access) {
    return null;
  }
  const guardianCenterIds = await dependencies.loadGuardianCenterIds(access);
  return {
    editionId: access.edition.id,
    scopes: resolveKalakritiRegistrationScopes(access, guardianCenterIds),
  };
}
