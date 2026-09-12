import { formatKalakritiGuardianHumanId } from "@pi-dash/shared/kalakriti";

const MAX_SEQUENCE = 2_147_483_647;

export function planKalakritiGuardianIds({
  year,
  nextGuardianSequence,
  existingHumanIds,
  count,
}: {
  year: number;
  nextGuardianSequence: number;
  existingHumanIds: readonly (string | null)[];
  count: number;
}): { humanIds: string[]; nextGuardianSequence: number } {
  formatKalakritiGuardianHumanId(year, nextGuardianSequence);
  if (!Number.isSafeInteger(count) || count < 0)
    throw new Error("Guardian allocation count is invalid");
  let next = nextGuardianSequence;
  // Reserve historical IDs too, including archived memberships and stale counters.
  const prefix = `KALG-${year}-`;
  for (const humanId of existingHumanIds) {
    if (!humanId?.startsWith(prefix)) continue;
    const suffix = humanId.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    const sequence = Number(suffix);
    if (!Number.isSafeInteger(sequence) || sequence >= MAX_SEQUENCE)
      throw new Error("Guardian sequence is exhausted");
    next = Math.max(next, sequence + 1);
  }
  if (next + count > MAX_SEQUENCE)
    throw new Error("Guardian sequence is exhausted");
  if (count === 0) return { humanIds: [], nextGuardianSequence };
  return {
    humanIds: Array.from({ length: count }, (_, index) =>
      formatKalakritiGuardianHumanId(year, next + index)
    ),
    nextGuardianSequence: next + count,
  };
}
