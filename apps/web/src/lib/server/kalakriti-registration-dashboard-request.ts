import type { resolveKalakritiRegistrationScopes } from "@/lib/kalakriti-registration-scope-policy";
import type { KalakritiRegistrationDashboardProjection } from "@/lib/server/kalakriti-registration-dashboard";
import type { resolveKalakritiRegistrationScope } from "@/lib/server/kalakriti-registration-scope";

interface RegistrationDashboardDependencies {
  getProjections: (input: {
    editionId: string;
    scopes: ReturnType<typeof resolveKalakritiRegistrationScopes>;
  }) => Promise<KalakritiRegistrationDashboardProjection[]>;
  resolveScope: typeof resolveKalakritiRegistrationScope;
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
  const resolved = await dependencies.resolveScope({ sessionUser, year });
  if (!resolved) {
    return null;
  }
  const projections = await dependencies.getProjections({
    editionId: resolved.editionId,
    scopes: resolved.scopes,
  });
  return { projections };
}
