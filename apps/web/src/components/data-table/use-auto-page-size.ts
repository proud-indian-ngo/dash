import debounce from "lodash/debounce";
import type { RefObject } from "react";
import { useEffect, useState } from "react";

/** Below this window width tables keep their default page size. */
const AUTO_PAGE_SIZE_MIN_WIDTH = 768;
const MAX_AUTO_PAGE_SIZE = 100;
/** Space kept under the frame so the pagination bar never sits on the edge. */
const BOTTOM_GAP = 24;

/** Number of rows that fit in `available` pixels, never below `minimum`. */
export function fitPageSize({
  available,
  minimum,
  rowHeight,
}: {
  available: number;
  minimum: number;
  rowHeight: number;
}) {
  if (rowHeight <= 0) {
    return minimum;
  }
  const fits = Math.floor(available / rowHeight);
  return Math.min(Math.max(fits, minimum), MAX_AUTO_PAGE_SIZE);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function measure(area: HTMLElement, minimum: number) {
  if (window.innerWidth < AUTO_PAGE_SIZE_MIN_WIDTH) {
    return null;
  }
  const rows = [...area.querySelectorAll<HTMLElement>("tbody tr")];
  if (rows.length === 0) {
    return null;
  }
  const head = area.querySelector<HTMLElement>("thead");
  const footer = area
    .closest("[data-slot=card]")
    ?.querySelector<HTMLElement>("[data-slot=card-footer]");
  const top = area.getBoundingClientRect().top + window.scrollY;
  const available =
    window.innerHeight -
    top -
    (head?.offsetHeight ?? 0) -
    (footer?.offsetHeight ?? 0) -
    BOTTOM_GAP;
  return fitPageSize({
    available,
    minimum,
    rowHeight: median(rows.map((row) => row.offsetHeight)),
  });
}

/**
 * Rows per page that fill the window below the table's top edge, measured once
 * rows render and again on resize. Returns null when it cannot measure (narrow
 * windows, no rows yet), so the caller falls back to its default.
 */
export function useAutoPageSize({
  areaRef,
  enabled,
  hasRows,
  minimum,
}: {
  areaRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  hasRows: boolean;
  minimum: number;
}) {
  const [pageSize, setPageSize] = useState<number | null>(null);

  useEffect(() => {
    const area = areaRef.current;
    if (!(enabled && hasRows && area)) {
      return;
    }
    const update = () => {
      setPageSize(measure(area, minimum));
    };
    update();
    const onResize = debounce(update, 200);
    window.addEventListener("resize", onResize);
    return () => {
      onResize.cancel();
      window.removeEventListener("resize", onResize);
    };
  }, [areaRef, enabled, hasRows, minimum]);

  return enabled ? pageSize : null;
}
