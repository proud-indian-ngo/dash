import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { resolveKalakritiRegistrationDashboardScopes } from "@/lib/kalakriti-registration-dashboard-policy";
import type { KalakritiRegistrationDashboardProjection } from "@/lib/server/kalakriti-registration-dashboard";

interface RegistrationDashboardDependencies {
  getProjections: (input: {
    editionId: string;
    scopes: ReturnType<typeof resolveKalakritiRegistrationDashboardScopes>;
  }) => Promise<KalakritiRegistrationDashboardProjection[]>;
  loadGuardianCenterIds: (
    access: NonNullable<KalakritiEditionAccess>
  ) => Promise<string[]>;
  resolveAccess: (input: {
    role: string;
    userId: string;
    year: number;
  }) => Promise<KalakritiEditionAccess | null>;
}

export async function resolveKalakritiRegistrationDashboardRequest(
  {
    sessionUser,
    year,
  }: {
    sessionUser: { id: string; role?: string | null } | null;
    year: number;
  },
  dependencies: RegistrationDashboardDependencies
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
  const scopes = resolveKalakritiRegistrationDashboardScopes(
    access,
    guardianCenterIds
  );
  const projections = await dependencies.getProjections({
    editionId: access.edition.id,
    scopes,
  });
  return { projections };
}
