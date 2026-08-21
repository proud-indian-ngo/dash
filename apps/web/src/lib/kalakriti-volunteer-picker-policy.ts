export function canAccessKalakritiVolunteerPicker(options: {
  isAssignedManager: boolean;
  permissions: readonly string[];
}): boolean {
  return (
    options.permissions.includes("kalakriti.admin") || options.isAssignedManager
  );
}
