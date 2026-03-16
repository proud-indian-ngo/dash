// Mirrors enum values from @pi-dash/db — keep in sync with packages/db/src/schema
export const cityValues = ["bangalore", "mumbai"] as const;

export const userRoleValues = ["volunteer", "admin"] as const;
export type UserRole = (typeof userRoleValues)[number];
