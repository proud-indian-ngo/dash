export function shouldRenderInterestRequests(
  canManageInterest: boolean | undefined,
  interests: readonly unknown[] | undefined
): boolean {
  return Boolean(canManageInterest && interests);
}
