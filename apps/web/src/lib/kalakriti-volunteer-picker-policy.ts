export function canAccessKalakritiVolunteerPicker(
  permissions: readonly string[]
): boolean {
  return (
    permissions.includes("kalakriti.admin") ||
    permissions.includes("kalakriti.view")
  );
}
