export interface CenterStanding {
  id: string;
  name: string;
  points: number;
  wins: number;
  runnerUps: number;
  rank: number;
}

export function rankKalakritiCenters(
  centers: readonly { id: string; name: string }[],
  awards: readonly { winnerCenterId: string; runnerUpCenterId: string }[],
  points: { winnerPoints: number; runnerUpPoints: number }
): CenterStanding[] {
  const rows = new Map(
    centers.map((center) => [
      center.id,
      { ...center, points: 0, wins: 0, runnerUps: 0, rank: 0 },
    ])
  );
  for (const award of awards) {
    const winner = rows.get(award.winnerCenterId);
    const runner = rows.get(award.runnerUpCenterId);
    if (!winner || !runner) throw new Error("Award Center is missing");
    winner.points += points.winnerPoints;
    winner.wins++;
    runner.points += points.runnerUpPoints;
    runner.runnerUps++;
  }
  const sorted = [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id)
  );
  for (const [index, row] of sorted.entries()) {
    const previous = sorted[index - 1];
    row.rank =
      previous && previous.points === row.points && previous.wins === row.wins
        ? previous.rank
        : index + 1;
  }
  return sorted;
}

export function assertKalakritiFinalOrder(
  centers: readonly CenterStanding[],
  winnerId: string,
  runnerId: string,
  reason: string | null
): void {
  const winner = centers.find((row) => row.id === winnerId);
  const runner = centers.find((row) => row.id === runnerId);
  if (!winner || !runner || winnerId === runnerId || winner.rank !== 1)
    throw new Error("Choose distinct Centers in standings order");
  const remaining = centers.filter((row) => row.id !== winnerId);
  if (runner.rank !== remaining[0]?.rank)
    throw new Error("Runner-up must follow standings order");
  const tiedFirst = centers.filter((row) => row.rank === 1).length > 1;
  const tiedSecond =
    remaining.filter((row) => row.rank === remaining[0]?.rank).length > 1;
  if ((tiedFirst || tiedSecond) && !reason?.trim())
    throw new Error("A reason is required to resolve the tied overall awards");
}

export function canManageKalakritiResults(
  access: {
    isGlobalAdmin: boolean;
    membership: {
      kind: string;
      assignments: readonly {
        responsibility: string;
        competitionId: string | null;
        competitionCategoryId: string | null;
      }[];
    } | null;
  },
  competition?: { id: string; competitionCategoryId: string }
): boolean {
  if (access.isGlobalAdmin) return true;
  if (access.membership?.kind !== "volunteer") return false;
  return access.membership.assignments.some(
    (assignment) =>
      assignment.responsibility === "edition_admin" ||
      assignment.responsibility === "overall_events_lead" ||
      (competition !== undefined &&
        ((assignment.responsibility === "competition_coordinator" &&
          assignment.competitionId === competition.id) ||
          (assignment.responsibility === "competition_category_lead" &&
            assignment.competitionCategoryId ===
              competition.competitionCategoryId)))
  );
}
