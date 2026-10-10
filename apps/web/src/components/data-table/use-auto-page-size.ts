import debounce from "lodash/debounce";
import type { RefObject } from "react";
import { useEffect, useState } from "react";

/** Below this window width tables keep their default page size. */
const AUTO_PAGE_SIZE_MIN_WIDTH = 768;
const MAX_AUTO_PAGE_SIZE = 100;
/** Fewest rows a fitted page shows; very short windows may still scroll. */
export const MIN_AUTO_PAGE_SIZE = 5;

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

function isInFlow(element: Element) {
  const { display, position } = getComputedStyle(element);
  return display !== "none" && position !== "absolute" && position !== "fixed";
}

/**
 * Height the page keeps under `element`: the margins, padding and borders of
 * each ancestor, plus any in-flow siblings and gaps that follow it.
 */
function spaceBelow(element: HTMLElement) {
  let total = 0;
  let node: HTMLElement | null = element;
  while (node?.parentElement && node !== document.body) {
    const parent: HTMLElement = node.parentElement;
    const parentStyle = getComputedStyle(parent);
    const gap = Number.parseFloat(parentStyle.rowGap) || 0;
    total += Number.parseFloat(getComputedStyle(node).marginBottom) || 0;
    for (
      let sibling = node.nextElementSibling;
      sibling;
      sibling = sibling.nextElementSibling
    ) {
      if (sibling instanceof HTMLElement && isInFlow(sibling)) {
        total += gap + sibling.offsetHeight;
      }
    }
    total +=
      (Number.parseFloat(parentStyle.paddingBottom) || 0) +
      (Number.parseFloat(parentStyle.borderBottomWidth) || 0);
    node = parent;
  }
  return total;
}

function measure(area: HTMLElement) {
  if (window.innerWidth < AUTO_PAGE_SIZE_MIN_WIDTH) {
    return null;
  }
  const body = area.querySelector<HTMLElement>("tbody");
  const rows = [...(body?.querySelectorAll<HTMLElement>(":scope > tr") ?? [])];
  const card = area.closest<HTMLElement>("[data-slot=card]") ?? area;
  if (!body || rows.length === 0) {
    return null;
  }
  const bodyRect = body.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  // Everything that is not a body row: the page above the rows, then the
  // totals row, scrollbar and footer inside the card, then the page below it.
  const available =
    window.innerHeight -
    (bodyRect.top + window.scrollY) -
    (cardRect.bottom - bodyRect.bottom) -
    spaceBelow(card);
  return fitPageSize({
    available,
    minimum: MIN_AUTO_PAGE_SIZE,
    rowHeight: median(rows.map((row) => row.offsetHeight)),
  });
}

/**
 * Rows per page that fill the window without making the page scroll. Measured
 * once rows render, then again when the window or anything around the table
 * changes size. Returns null when it cannot measure (narrow windows, no rows
 * yet), so the caller falls back to its default.
 */
export function useAutoPageSize({
  areaRef,
  enabled,
  hasRows,
}: {
  areaRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  hasRows: boolean;
}) {
  const [pageSize, setPageSize] = useState<number | null>(null);

  useEffect(() => {
    const area = areaRef.current;
    if (!(enabled && hasRows && area)) {
      return;
    }
    const update = () => {
      setPageSize(measure(area));
    };
    update();
    const onResize = debounce(update, 150);
    window.addEventListener("resize", onResize);
    // The fit ignores how many rows render, so watching the table's ancestors
    // catches content above or below it changing (chips, filters, totals)
    // without feeding back on its own page size.
    const observer = new ResizeObserver(onResize);
    for (
      let node: HTMLElement | null = area;
      node && node !== document.body;
      node = node.parentElement
    ) {
      observer.observe(node);
    }
    return () => {
      onResize.cancel();
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [areaRef, enabled, hasRows]);

  return enabled ? pageSize : null;
}
