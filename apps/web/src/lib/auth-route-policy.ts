export function isPublicBetterAuthAdminPath(url: string): boolean {
  return new URL(url).pathname.startsWith("/api/auth/admin/");
}
