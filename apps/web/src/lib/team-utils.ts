export function isTeamLead(
  members: ReadonlyArray<{ userId: string; role: string | null }>,
  userId: string
): boolean {
  return members.some((m) => m.userId === userId && m.role === "lead");
}
