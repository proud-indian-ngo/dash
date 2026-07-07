import { redirect } from "@tanstack/react-router";

export function assertPermission(
  context: { permissions?: string[] },
  permission: string
) {
  if (!context.permissions?.includes(permission)) {
    throw redirect({ to: "/" });
  }
}

export function assertAnyPermission(
  context: { permissions?: string[] },
  ...permissions: string[]
) {
  if (!permissions.some((p: any) => context.permissions?.includes(p))) {
    throw redirect({ to: "/" });
  }
}
