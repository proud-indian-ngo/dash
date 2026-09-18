import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type {
  ColumnPinningState,
  ColumnVisibilityState,
} from "@tanstack/react-table";

import { resolveColumnDefId } from "@/lib/table-utils";

export const COMPACT_EXPAND_COLUMN_ID = "compactExpand";
export const COMPACT_BREAKPOINT = 768;

const ALWAYS_COLUMN_IDS = new Set([
  "actions",
  "expand",
  "select",
  COMPACT_EXPAND_COLUMN_ID,
]);

export type CompactColumnRole =
  | "always"
  | "collapsed"
  | "hidden"
  | "primary"
  | "trailing";

export interface CompactColumnRef {
  compact?: CompactColumnRole;
  id: string;
}

export interface CompactPartition {
  alwaysIds: string[];
  collapsedIds: string[];
  firstPrimaryId: string | undefined;
  hasCollapsed: boolean;
  hiddenIds: string[];
  stackedPrimaryIds: string[];
  trailingIds: string[];
}

export function toCompactColumnRefs<TData extends object>(
  columns: readonly DataGridColumnDef<TData>[]
): CompactColumnRef[] {
  return columns.flatMap((column) => {
    const id = resolveColumnDefId(column);
    return id ? [{ compact: column.meta?.compact, id }] : [];
  });
}

export function getFirstDataColumnId(
  columns: readonly CompactColumnRef[]
): string | undefined {
  return columns.find((column) => !ALWAYS_COLUMN_IDS.has(column.id))?.id;
}

export function resolveCompactRole(
  column: CompactColumnRef,
  firstDataColumnId: string | undefined
): CompactColumnRole {
  if (column.compact) {
    return column.compact;
  }
  if (ALWAYS_COLUMN_IDS.has(column.id)) {
    return "always";
  }
  if (column.id === firstDataColumnId) {
    return "primary";
  }
  return "collapsed";
}

export function partitionCompactColumns(
  columns: readonly CompactColumnRef[]
): CompactPartition {
  const firstDataColumnId = getFirstDataColumnId(columns);
  const alwaysIds: string[] = [];
  const collapsedIds: string[] = [];
  const hiddenIds: string[] = [];
  const primaryIds: string[] = [];
  const trailingIds: string[] = [];

  for (const column of columns) {
    switch (resolveCompactRole(column, firstDataColumnId)) {
      case "always":
        alwaysIds.push(column.id);
        break;
      case "collapsed":
        collapsedIds.push(column.id);
        break;
      case "hidden":
        hiddenIds.push(column.id);
        break;
      case "primary":
        primaryIds.push(column.id);
        break;
      case "trailing":
        trailingIds.push(column.id);
        break;
      default:
        break;
    }
  }

  const orderedPrimaryIds = orderStackedPrimaryIds(primaryIds);

  return {
    alwaysIds,
    collapsedIds,
    firstPrimaryId: orderedPrimaryIds[0],
    hasCollapsed: collapsedIds.length > 0,
    hiddenIds,
    stackedPrimaryIds: orderedPrimaryIds.slice(1),
    trailingIds,
  };
}

const IDENTITY_PRIMARY_IDS = ["action", "student"];

function orderStackedPrimaryIds(primaryIds: string[]): string[] {
  const identity = IDENTITY_PRIMARY_IDS.find((id) => primaryIds.includes(id));
  if (!identity) {
    return primaryIds;
  }
  return [identity, ...primaryIds.filter((id) => id !== identity)];
}

export function compactForceHiddenIds(
  partition: CompactPartition
): ReadonlySet<string> {
  return new Set([
    ...partition.collapsedIds,
    ...partition.hiddenIds,
    ...partition.stackedPrimaryIds,
    ...partition.trailingIds,
  ]);
}

export function overlayCompactVisibility(
  persisted: ColumnVisibilityState,
  partition: CompactPartition,
  showExpand = true
): ColumnVisibilityState {
  const overlay: ColumnVisibilityState = { ...persisted };
  for (const id of compactForceHiddenIds(partition)) {
    overlay[id] = false;
  }
  overlay[COMPACT_EXPAND_COLUMN_ID] = showExpand;
  overlay.expand = showExpand;
  if (
    partition.firstPrimaryId &&
    persisted[partition.firstPrimaryId] !== false
  ) {
    overlay[partition.firstPrimaryId] = true;
  }
  return overlay;
}

export function applyCompactVisibilityChange(
  persisted: ColumnVisibilityState,
  overlay: ColumnVisibilityState,
  nextTableVisibility: ColumnVisibilityState,
  partition: CompactPartition
): ColumnVisibilityState {
  const forceHidden = compactForceHiddenIds(partition);
  const nextPersisted: ColumnVisibilityState = { ...persisted };
  const ids = new Set([
    ...Object.keys(persisted),
    ...Object.keys(overlay),
    ...Object.keys(nextTableVisibility),
  ]);
  ids.delete(COMPACT_EXPAND_COLUMN_ID);
  ids.delete("expand");

  for (const id of ids) {
    const wasVisible = overlay[id] !== false;
    const isVisible = nextTableVisibility[id] !== false;
    if (forceHidden.has(id)) {
      if (isVisible && !wasVisible) {
        nextPersisted[id] = true;
      }
      continue;
    }
    if (wasVisible === isVisible) {
      continue;
    }
    nextPersisted[id] = isVisible;
  }

  delete nextPersisted[COMPACT_EXPAND_COLUMN_ID];
  return nextPersisted;
}

export function visibleCollapsedIds(
  collapsedIds: readonly string[],
  persisted: ColumnVisibilityState
): string[] {
  return collapsedIds.filter((id) => persisted[id] !== false);
}

export function visibleStackedPrimaryIds(
  stackedPrimaryIds: readonly string[],
  persisted: ColumnVisibilityState
): string[] {
  return stackedPrimaryIds.filter((id) => persisted[id] !== false);
}

export function withCompactExpandOrder(
  columnOrder: readonly string[],
  hasSelect: boolean
): string[] {
  const without = columnOrder.filter(
    (id) => id !== COMPACT_EXPAND_COLUMN_ID && id !== "select"
  );
  if (hasSelect) {
    return ["select", COMPACT_EXPAND_COLUMN_ID, ...without];
  }
  return [COMPACT_EXPAND_COLUMN_ID, ...without];
}

export function findExistingExpandColumnId<TData extends object>(
  columns: readonly DataGridColumnDef<TData>[]
): string | undefined {
  for (const column of columns) {
    const id = resolveColumnDefId(column);
    if (id === "expand" || id === COMPACT_EXPAND_COLUMN_ID) {
      return id;
    }
  }
  return undefined;
}

export function insertExpandColumn<TData extends object>(
  columns: readonly DataGridColumnDef<TData>[],
  expandColumn: DataGridColumnDef<TData>
): DataGridColumnDef<TData>[] {
  if (findExistingExpandColumnId(columns)) {
    return [...columns];
  }
  const selectIndex = columns.findIndex(
    (column) => resolveColumnDefId(column) === "select"
  );
  if (selectIndex >= 0) {
    return [
      ...columns.slice(0, selectIndex + 1),
      expandColumn,
      ...columns.slice(selectIndex + 1),
    ];
  }
  return [expandColumn, ...columns];
}

export function stripCompactExpandId(ids: readonly string[]): string[] {
  return ids.filter((id) => id !== COMPACT_EXPAND_COLUMN_ID);
}

export function withCompactExpandPinning(
  pinning: ColumnPinningState
): ColumnPinningState {
  const start = stripCompactExpandId(pinning.start ?? []);
  const selectIndex = start.indexOf("select");
  const nextStart =
    selectIndex >= 0
      ? [
          ...start.slice(0, selectIndex + 1),
          COMPACT_EXPAND_COLUMN_ID,
          ...start.slice(selectIndex + 1),
        ]
      : [COMPACT_EXPAND_COLUMN_ID, ...start];
  return { end: pinning.end, start: nextStart };
}
