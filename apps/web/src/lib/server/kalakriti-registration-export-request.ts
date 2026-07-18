import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { resolveKalakritiRegistrationDashboardScopes } from "@/lib/kalakriti-registration-dashboard-policy";
import type { KalakritiRegistrationExportData } from "@/lib/kalakriti-registration-export";

interface RegistrationExportDependencies {
  getExport: (input: {
    editionId: string;
    scopes: ReturnType<typeof resolveKalakritiRegistrationDashboardScopes>;
  }) => Promise<KalakritiRegistrationExportData>;
  loadGuardianCenterIds: (
    access: NonNullable<KalakritiEditionAccess>
  ) => Promise<string[]>;
  resolveAccess: (input: {
    role: string;
    userId: string;
    year: number;
  }) => Promise<KalakritiEditionAccess | null>;
}

export async function resolveKalakritiRegistrationExportRequest(
  {
    sessionUser,
    year,
  }: {
    sessionUser: { id: string; role?: string | null } | null;
    year: number;
  },
  dependencies: RegistrationExportDependencies
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
  if (scopes.length === 0) {
    return null;
  }
  return dependencies.getExport({ editionId: access.edition.id, scopes });
}
