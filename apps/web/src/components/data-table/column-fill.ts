import type { ColumnSizingState, Updater } from "@tanstack/react-table";

// Explicit app defaults also passed to TanStack, so layout and rendering agree.
export const TABLE_COLUMN_DEFAULTS = {
  size: 150,
  minSize: 20,
  maxSize: Number.MAX_SAFE_INTEGER,
};
export interface SizingColumn {
  id: string;
  size?: number;
  minSize?: number;
  maxSize?: number;
}
interface FillInput {
  columns: readonly SizingColumn[];
  preferred: ColumnSizingState;
  order: readonly string[];
  visibility: Record<string, boolean>;
  pinning: { start?: readonly string[]; end?: readonly string[] };
  viewportWidth: number;
}
function bounds(column: SizingColumn) {
  const min = column.minSize ?? TABLE_COLUMN_DEFAULTS.minSize;
  return {
    min,
    max: Math.max(min, column.maxSize ?? TABLE_COLUMN_DEFAULTS.maxSize),
  };
}
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
export function deriveColumnFill({
  columns,
  preferred,
  order,
  visibility,
  pinning,
  viewportWidth,
}: FillInput) {
  const byId = new Map(columns.map((column) => [column.id, column]));
  const orderedIds = [
    ...new Set([...order, ...columns.map((column) => column.id)]),
  ].filter((id) => byId.has(id) && visibility[id] !== false);
  const pinned = new Set([...(pinning.start ?? []), ...(pinning.end ?? [])]);
  const base = new Map(
    columns.map((column) => {
      const { min, max } = bounds(column);
      const saved = preferred[column.id];
      const size = Number.isFinite(saved)
        ? saved!
        : (column.size ?? TABLE_COLUMN_DEFAULTS.size);
      return [column.id, clamp(size, min, max)] as const;
    })
  );
  const total = orderedIds.reduce((sum, id) => sum + base.get(id)!, 0);
  const fillerId =
    viewportWidth > 0
      ? [...orderedIds].reverse().find((id) => !pinned.has(id))
      : undefined;
  let effective = preferred;
  let fillerMinimum: number | undefined;
  if (fillerId) {
    const { min, max } = bounds(byId.get(fillerId)!);
    fillerMinimum = clamp(
      viewportWidth - (total - base.get(fillerId)!),
      min,
      max
    );
    const size = Math.max(base.get(fillerId)!, fillerMinimum);
    if (size !== base.get(fillerId))
      effective = { ...preferred, [fillerId]: size };
  }
  return { effective, fillerId, fillerMinimum, byId };
}
export type ColumnFill = ReturnType<typeof deriveColumnFill>;

// TanStack resize handlers emit patches against the effective (rendered) map.
// Persist only changed keys, never copy the derived filler into user preferences.
// Filler gestures begin at its rendered size and shrink only to the fill floor;
// growing past that floor produces overflow immediately, with no release jump.
export function applyPreferredSizingChange(
  preferred: ColumnSizingState,
  fill: ColumnFill,
  updater: Updater<ColumnSizingState>
): ColumnSizingState {
  const requested =
    typeof updater === "function" ? updater(fill.effective) : updater;
  let result = preferred;
  const write = () => {
    if (result === preferred) result = { ...preferred };
  };
  for (const id of new Set([
    ...Object.keys(fill.effective),
    ...Object.keys(requested),
  ])) {
    if (!Object.hasOwn(requested, id)) {
      if (Object.hasOwn(preferred, id)) {
        write();
        delete result[id];
      }
      continue;
    }
    if (requested[id] === fill.effective[id]) continue;
    const column = fill.byId.get(id);
    if (!column || !Number.isFinite(requested[id])) continue;
    const { min, max } = bounds(column);
    const minimum = id === fill.fillerId ? (fill.fillerMinimum ?? min) : min;
    const size = clamp(requested[id]!, minimum, max);
    const rendered = clamp(
      fill.effective[id] ?? column.size ?? TABLE_COLUMN_DEFAULTS.size,
      min,
      max
    );
    if (size === rendered || size === preferred[id]) continue;
    write();
    result[id] = size;
  }
  return result;
}
