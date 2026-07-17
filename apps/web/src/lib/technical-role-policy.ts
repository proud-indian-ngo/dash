import { TECHNICAL_ROLE_IDS } from "@pi-dash/db/permissions";

const TECHNICAL_ROLE_ERROR = "This user is managed by its owning workflow";

export function assertGenericRoleAssignment(roleId: string): void {
  if (TECHNICAL_ROLE_IDS.has(roleId)) {
    throw new Error(TECHNICAL_ROLE_ERROR);
  }
}

export function assertGenericUserManagement(
  roleId: string | null | undefined
): void {
  if (roleId && TECHNICAL_ROLE_IDS.has(roleId)) {
    throw new Error(TECHNICAL_ROLE_ERROR);
  }
}
