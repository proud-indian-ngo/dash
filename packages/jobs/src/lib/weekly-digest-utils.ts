/** IST offset in milliseconds (+5:30). */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function computeWeekRange(nowUtc = Date.now()): {
  weekStart: Date;
  weekEnd: Date;
  weekStartMs: number;
  weekEndMs: number;
} {
  // Compute "now" in IST by shifting UTC
  const nowIst = new Date(nowUtc + IST_OFFSET_MS);

  // Find Monday 00:00 IST
  const dayOfWeek = nowIst.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const mondayIst = new Date(nowIst);
  mondayIst.setUTCDate(nowIst.getUTCDate() + mondayOffset);
  mondayIst.setUTCHours(0, 0, 0, 0);

  // Convert back to real UTC
  const weekStartMs = mondayIst.getTime() - IST_OFFSET_MS;
  const weekStart = new Date(weekStartMs);

  const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000 - 1;
  const weekEnd = new Date(weekEndMs);

  return {
    weekStart,
    weekEnd,
    weekStartMs,
    weekEndMs,
  };
}
