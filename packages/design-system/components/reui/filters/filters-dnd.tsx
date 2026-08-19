// @ts-nocheck
"use client"

import * as React from "react"

/**
 * The gesture model here is the event calendar's, deliberately.
 *
 * `event-calendar-dnd.tsx` in this same registry is a custom pointer engine
 * rather than dnd-kit, and this file mirrors its architecture: the same
 * activation policy, the same "measure the surface ONCE at activation and then
 * live on window listeners" discipline, the same idempotent teardown that every
 * one of pointerup, pointercancel, Escape, window blur and an unmount can win,
 * and the same vanilla-DOM overlay so a drag costs zero React renders per frame.
 *
 * It does NOT import that module, and must not. Filters is installable on its
 * own, and a `shadcn add filters` that pulled the whole event calendar in for a
 * drag handle would be a worse trade than sharing the reasoning and not the
 * code. What is shared is the model; what is not shared is the domain, because
 * a calendar drags across a measured time grid and a builder drags into a tree.
 */
export const FILTER_DND_ACTIVATION = {
  /** Mouse travel before a press becomes a drag. Below this it stays a click. */
  moveDistancePx: 5,
  /** Touch long-press before a drag starts, so a swipe still scrolls. */
  touchDelayMs: 250,
  /** Touch travel that cancels the pending long press. */
  touchTolerancePx: 5,
  /** Distance from a scroll edge at which the panel starts following. */
  autoScrollEdgePx: 40,
  autoScrollMaxStepPx: 12,
  /**
   * How far below and right of the pointer the carry sits.
   *
   * Enough that the carry clears the row under the pointer, which is the row
   * the drop indicator is drawn on; small enough that it still reads as the
   * thing being held rather than as something following it around.
   */
  carryPointerOffsetPx: 12,
} as const

/** One rule row, or one group's header row. Both are drag sources and targets. */
export const FILTER_ROW_SELECTOR = '[data-slot="filter-row"]'

/**
 * An explicit "put it INSIDE this group" target.
 *
 * A group's headline and its empty placeholder both carry it. Without an
 * explicit zone a pointer over a group could only ever mean "beside it": the
 * headline sits inside the group's own row element, so the row hit test would
 * answer with the group itself, and dropping into a group is the entire reason
 * the group card is a card.
 */
export const FILTER_DROP_ZONE_SELECTOR = "[data-drop-parent]"

/**
 * The group CARD a zone belongs to.
 *
 * The zone is the headline or the empty placeholder, which is a strip inside the
 * card; the destination the user is actually choosing is the whole group. Ringing
 * the strip said "beside this line", which is the one thing dropping into a group
 * does not mean. The engine therefore marks the card as well as the zone, so the
 * chrome can light the destination up without a `:has()` selector re-evaluating
 * on every frame of a gesture.
 */
export const FILTER_GROUP_SELECTOR = '[data-slot="filter-group"]'

/* -------------------------------------------------------------------------- */
/*                              Drop resolution                               */
/* -------------------------------------------------------------------------- */

/**
 * A measured drop candidate, geometry only.
 *
 * Split from its element so the resolution below is a pure function of numbers.
 * That is what makes "a nested row wins over the group that contains it" a
 * table test rather than a claim about a browser nobody runs in CI.
 */
export interface FilterDropBox {
  top: number
  bottom: number
  left: number
  right: number
  /** The group the drop writes into. */
  parentId: string
  /** Where in that group's children the node lands. */
  index: number
  /** How many rows enclose this box. Deeper wins. */
  depth: number
}

export interface FilterDropResolution<T extends FilterDropBox> {
  target: T
  /**
   * Null for a zone, which means INTO the group rather than beside anything.
   * `"before"` and `"after"` are which edge of a row the indicator draws on.
   */
  edge: "before" | "after" | null
}

function contains(
  box: FilterDropBox,
  x: number,
  y: number,
  grow = 0
): boolean {
  return (
    x >= box.left &&
    x <= box.right &&
    y >= box.top - grow &&
    y <= box.bottom + grow
  )
}

/**
 * How far a ROW reaches past its own rect, vertically, when hit tested.
 *
 * HALF OF THE GAP the builder puts between sibling rows, and it has to stay
 * half of it: the body and every group's list of children are `gap-3`, so this
 * is six. It was four while that gap was `gap-2` and three while it was six,
 * and the number has moved with the gap every time, because the two are one
 * measurement written twice. See `FILTER_ROW_GAP_CLASS`, which is the other
 * half. A seam short of half the gap leaves a strip in the middle that belongs
 * to no row, which is the whole defect below coming back at a fraction of its
 * width.
 *
 * This is the whole fix for the worst bug the drop layer had. The seam between
 * two adjacent rows is inside NEITHER row's rect, so a pointer aimed exactly
 * where a user aims when they mean "put it between these two" fell through to
 * whatever box did enclose it - and a group's rect encloses its children. The
 * measured result was three different wrong answers at three different depths:
 * at the top level nothing owned the seam at all, so the cursor said `no-drop`;
 * one level in the enclosing group resolved to the source's own slot and the
 * panel painted `data-drop-noop` on the source, falsely promising "it stays
 * here"; two levels in it resolved to an EDGE on the enclosing group, so a
 * release three pixels above a working drop landed the row one level OUT of the
 * group it was visually between, with the indicator drawn 43px above the
 * pointer.
 *
 * Growing each row by half the gap makes adjacent siblings TILE: row one ends
 * where row two begins, with no gap and no ambiguity. Where they touch, both
 * contain the point and the first wins - which costs nothing, because "after
 * row one" and "before row two" name the same slot for adjacent siblings.
 *
 * The depth sort then does the rest on its own. A child grown by the seam still
 * sits deeper than the group whose rect encloses the seam, so the child wins and
 * the group stops answering for the space between its own children.
 *
 * Rows ONLY. A zone is an explicit strip and growing one would let it swallow
 * space it was never drawn over, and zones already beat rows outright.
 */
export const FILTER_ROW_SEAM_PX = 6

/**
 * Where a pointer at (x, y) would put the dragged node.
 *
 * Zones before rows, and within each band the DEEPEST box wins. Both orderings
 * are the same rule stated twice: the most specific thing under the pointer is
 * what the user is pointing at. Without the depth sort a pointer over a
 * condition nested two groups down hits its group's row first (a group's rect
 * encloses everything it holds) and the indicator would offer to drop beside
 * the whole group.
 *
 * `seam` is how far a row reaches into the gap beside it. See
 * `FILTER_ROW_SEAM_PX`; it is a parameter so the tiling rule is a table test
 * rather than a claim about a browser nobody runs in CI.
 */
export function resolveFilterDrop<T extends FilterDropBox>(
  zones: T[],
  rows: T[],
  x: number,
  y: number,
  seam: number = FILTER_ROW_SEAM_PX
): FilterDropResolution<T> | null {
  let zone: T | null = null
  for (const candidate of zones) {
    if (!contains(candidate, x, y)) continue
    if (!zone || candidate.depth > zone.depth) zone = candidate
  }
  if (zone) return { target: zone, edge: null }

  let row: T | null = null
  for (const candidate of rows) {
    if (!contains(candidate, x, y, seam)) continue
    if (!row || candidate.depth > row.depth) row = candidate
  }
  if (!row) return null

  // The midpoint, not the nearest edge: a row is the width of the panel and the
  // pointer spends most of a drag somewhere in the middle of one, so a
  // proximity test would leave the indicator undecided across most of the row.
  const after = y > row.top + (row.bottom - row.top) / 2
  return {
    target: { ...row, index: row.index + (after ? 1 : 0) },
    edge: after ? "after" : "before",
  }
}

/** Where a dragged node started, which is what makes a drop a no-op or not. */
export interface FilterDropOrigin {
  parentId: string
  index: number
}

/**
 * Whether releasing here would leave the tree exactly as it is.
 *
 * The two indices are the slot BEFORE the node and the slot AFTER it, and both
 * name the position it already occupies: `moveFilterNodeTo` closes the gap the
 * detach leaves, so "before my next sibling" and "after my previous sibling" are
 * both spelled "where I already am". Without this the indicator lights up under
 * a release that then changes nothing, which reads as a dropped drag rather than
 * as a deliberate no-op.
 *
 * Copy is never a no-op: Alt+release beside yourself is exactly how a condition
 * is duplicated in place.
 *
 * Pure, and separate from `resolveFilterDrop`, because it answers a question
 * about the SOURCE. Resolution is about what is under the pointer and stays
 * testable without one.
 */
export function isFilterDropNoop(
  resolution: FilterDropResolution<FilterDropBox> | null,
  origin: FilterDropOrigin | null,
  copy: boolean
): boolean {
  if (!resolution || !origin || copy) return false
  if (resolution.target.parentId !== origin.parentId) return false
  return (
    resolution.target.index === origin.index ||
    resolution.target.index === origin.index + 1
  )
}

/* -------------------------------------------------------------------------- */
/*                                Module state                                */
/* -------------------------------------------------------------------------- */

/**
 * Registry of in-flight cancels.
 *
 * A gesture lives on window listeners and a body-appended overlay, so nothing
 * inside the builder can be trusted to end it: rows legitimately unmount
 * mid-gesture when a consumer re-renders the query from a subscription. The
 * PANEL leaving is what aborts, and it aborts through here.
 */
const activeCancels = new Set<() => void>()

/** Cancel and fully revert every in-flight filter row drag. */
export function cancelActiveFilterDrags(): void {
  for (const cancel of [...activeCancels]) cancel()
}

let lastDragEndedAt = 0

/**
 * Whether a drag ended within the last few frames.
 *
 * Exported because a consumer that puts its own click handler on a row needs
 * the same answer the suppressor below needs, and re-deriving it from a
 * `pointerup` they never saw is not something a call site can do.
 */
export function wasRecentFilterDrag(): boolean {
  return performance.now() - lastDragEndedAt < 250
}

/**
 * Swallow the click the browser fires after the release that ended a drag.
 *
 * It is armed on release and disarms itself on the next click, whenever that
 * comes. Deliberately NOT `{ once: true }` alone: a drag that ends over a
 * different element than it began on produces no click at all, and a one-shot
 * listener left armed would then eat the user's NEXT click, minutes later, on
 * something unrelated. The timestamp is what makes a stale arming harmless.
 */
function suppressTrailingClick(event: MouseEvent) {
  window.removeEventListener("click", suppressTrailingClick, true)
  if (!wasRecentFilterDrag()) return
  event.stopPropagation()
  event.preventDefault()
}

/**
 * Round a translate offset to the device pixel grid.
 *
 * The carry is its own compositing layer: the GPU rasterizes its text once and
 * repositions that texture per frame, so a subpixel translate (raw clientX/Y is
 * routinely fractional) resamples it and blurs every glyph in the row being
 * dragged. Rounding lands the layer on the grid without giving up the per-frame
 * GPU transform.
 */
function snapToPixel(value: number): number {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
  return Math.round(value * dpr) / dpr
}

/* -------------------------------------------------------------------------- */
/*                                  Surface                                   */
/* -------------------------------------------------------------------------- */

/**
 * A box plus the two elements the indicator is written to.
 *
 * `card` is the group a ZONE belongs to, resolved once here rather than walked
 * per frame in `paint`: `closest` from every zone on every pointermove is a tree
 * walk the gesture does not need, and the answer cannot change while the surface
 * is frozen. Null on a row, which stands for itself.
 */
type MeasuredBox = FilterDropBox & {
  el: HTMLElement
  card: HTMLElement | null
}

interface Surface {
  zones: MeasuredBox[]
  rows: MeasuredBox[]
  /**
   * The scroll container the builder sits in, if any.
   *
   * Rects are captured ONCE, so the one thing that can invalidate them without
   * a re-measure is this element scrolling. Reading its scrollTop lets every
   * later hit test correct for that with one subtraction instead of a fresh
   * `getBoundingClientRect` per pointermove - a read that forces a synchronous
   * layout of the whole document, which on a long docs page is the difference
   * between a drag and a slideshow.
   *
   * THE ELEMENT, NOT A MIRROR OF ITS SCROLLTOP, and that was a real bug rather
   * than a tidy-up. A number the engine keeps in step only ever tracks the
   * scrolling the engine itself does, so a wheel, a trackpad two-finger or a
   * programmatic `scrollIntoView` mid-gesture left every cached rect stale
   * while the correction read zero: the indicator painted 60px from the
   * pointer, and the release committed to that stale slot. `startScrollTop` is
   * the only number kept, because it is the position the rects were taken at
   * and that one cannot change.
   */
  viewport: HTMLElement | null
  viewportRect: DOMRect | null
  startScrollTop: number
}

/**
 * The nearest element that actually scrolls, THIS ONE INCLUDED, or null.
 *
 * Itself, and that is the case it exists for. Targets are measured inside the
 * panel, and the panel is exactly the element a consumer caps and hands
 * `overflow-y: auto` to, so a walk that started at the parent answered null for
 * the one box whose scrolling moves every rect being measured.
 */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el ?? null
  while (node) {
    const style = getComputedStyle(node)
    const overflow = `${style.overflowY} ${style.overflow}`
    if (/(auto|scroll|overlay)/.test(overflow) && node.scrollHeight > node.clientHeight) {
      return node
    }
    node = node.parentElement
  }
  return null
}

/** How many rows enclose an element. A root row is 0. */
function rowDepth(el: HTMLElement, root: HTMLElement): number {
  let depth = 0
  let node = el.parentElement
  while (node && node !== root) {
    if (node.matches(FILTER_ROW_SELECTOR)) depth++
    node = node.parentElement
  }
  return depth
}

/**
 * Measure every drop target once.
 *
 * The dragged node's DESCENDANTS are excluded rather than merely refused later.
 * `moveFilterNodeTo` does refuse a group dropped inside itself, but an
 * indicator that lights up on a target the drop will silently ignore is a
 * promise the gesture does not keep.
 *
 * The dragged row ITSELF is kept, and that is deliberate. Excluding it left a
 * hole exactly where the user picked the row up: the pointer sat in a band no
 * target owned, so lifting a top-level row and holding still resolved to
 * nothing, which the cursor now has to call an invalid drop. Keeping it makes
 * its own slot resolve to its own position, which `isFilterDropNoop` reads as
 * "it stays here" - the honest answer, and the one that keeps the invalid state
 * meaning "releasing here does nothing at all".
 */
function collectSurface(root: HTMLElement, dragged: HTMLElement): Surface {
  const zones: MeasuredBox[] = []
  const rows: MeasuredBox[] = []

  for (const el of root.querySelectorAll<HTMLElement>(FILTER_DROP_ZONE_SELECTOR)) {
    if (dragged.contains(el)) continue
    const parentId = el.dataset.dropParent
    if (!parentId) continue
    const rect = el.getBoundingClientRect()
    zones.push({
      el,
      card: el.closest<HTMLElement>(FILTER_GROUP_SELECTOR),
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      parentId,
      index: Number(el.dataset.dropIndex ?? 0),
      depth: rowDepth(el, root),
    })
  }

  for (const el of root.querySelectorAll<HTMLElement>(FILTER_ROW_SELECTOR)) {
    if (el !== dragged && dragged.contains(el)) continue
    const parentId = el.dataset.parentId
    if (!parentId) continue
    const rect = el.getBoundingClientRect()
    rows.push({
      el,
      card: null,
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      parentId,
      index: Number(el.dataset.index ?? 0),
      depth: rowDepth(el, root),
    })
  }

  const viewport = findScrollParent(root)
  return {
    zones,
    rows,
    viewport,
    viewportRect: viewport?.getBoundingClientRect() ?? null,
    startScrollTop: viewport?.scrollTop ?? 0,
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Engine                                   */
/* -------------------------------------------------------------------------- */

export interface FilterDropDetails {
  parentId: string
  index: number
  /** Alt was held at release: copy the node rather than moving it. */
  copy: boolean
}

export interface FilterRowDragOptions {
  /**
   * The element every target is measured inside, and nothing outside it is one.
   *
   * The PANEL rather than its body. The append zone for the top level sits in
   * the footer, which is the body's SIBLING, so a root that stopped at the body
   * left the one list with no parent group to catch a near miss as the one list
   * with no append target at all.
   */
  root: () => HTMLElement | null
  onDrop: (nodeId: string, details: FilterDropDetails) => void
  disabled?: boolean
}

/**
 * Written straight to the DOM: a React state write per move is a tree render.
 *
 * A zone marks TWO elements, the zone and the card it sits in, so the chrome can
 * paint the whole group as the destination while the zone itself stays the thing
 * that was measured. Both are cleared unconditionally, because the pointer
 * leaving a group has to unmark whatever the last frame lit.
 */
function paint(surface: Surface, hit: FilterDropResolution<MeasuredBox> | null) {
  for (const box of surface.zones) {
    delete box.el.dataset.dropInto
    if (box.card) delete box.card.dataset.dropInto
  }
  for (const box of surface.rows) delete box.el.dataset.dropEdge
  if (!hit) return
  if (hit.edge) {
    hit.target.el.dataset.dropEdge = hit.edge
    return
  }
  hit.target.el.dataset.dropInto = ""
  if (hit.target.card) hit.target.card.dataset.dropInto = ""
}

function startDrag(
  event: React.PointerEvent<HTMLElement>,
  nodeId: string,
  options: FilterRowDragOptions
) {
  const handle = event.currentTarget
  const root = options.root()
  const source = handle.closest<HTMLElement>(FILTER_ROW_SELECTOR)
  if (!root || !source) return

  const pointerId = event.pointerId
  const isTouch = event.pointerType === "touch"
  const startX = event.clientX
  const startY = event.clientY

  // Read from the row's own attributes rather than passed in, because the panel
  // knows the node id and the DOM knows where it sits, and asking the panel for
  // both would mean threading a position through the drag context that the row
  // already publishes for the hit test to read.
  const origin: FilterDropOrigin | null = source.dataset.parentId
    ? {
        parentId: source.dataset.parentId,
        index: Number(source.dataset.index ?? 0),
      }
    : null

  let active = false
  let finished = false
  let surface: Surface | null = null
  let hit: FilterDropResolution<MeasuredBox> | null = null
  let copy = event.altKey
  let lastEvent: PointerEvent | null = null
  let touchTimer: ReturnType<typeof setTimeout> | null = null
  let rafScroll = 0

  /**
   * What releasing right now would do, as three states rather than a boolean.
   *
   * `"ok"` lands somewhere new, `"noop"` puts the node back where it came from,
   * `"none"` is over nothing at all. They are three different promises, so they
   * get three different cursors and three different marks, and none of them is
   * "an indicator is drawn somewhere and you find out on release".
   */
  let dropState: "ok" | "noop" | "none" = "none"

  /* --------------------------------- carry -------------------------------- */

  let carryEl: HTMLDivElement | null = null
  let badgeEl: HTMLSpanElement | null = null
  // Where inside the row the pointer went down, so the copy can hold that spot.
  let grabOffsetX = FILTER_DND_ACTIVATION.carryPointerOffsetPx
  let grabOffsetY = FILTER_DND_ACTIVATION.carryPointerOffsetPx

  /**
   * A PICTURE OF THE ROW, at the row's own size.
   *
   * This was a one-line summary for a while, and the reason was measured: the
   * destination used to be a six-pixel pad in the gap between two rows, and a
   * full-width clone covered it at 13 of 16 pointer positions. The summary made
   * the indicator visible by making the thing in flight small.
   *
   * The destination is now a slot the SIZE OF THE ROW, so that trade is off.
   * What the user drags looks like what they are dragging, and what it will
   * become looks like a row, and neither has to be inferred from a sentence.
   *
   * TRANSLUCENT rather than opaque, which is what keeps the earlier fix's
   * intent: the slot underneath still reads through the clone, so the answer to
   * "where does this land" is never entirely hidden by the thing landing.
   *
   * `cloneNode(true)` copies ids and form state along with the markup. The
   * whole subtree is `aria-hidden` and `pointer-events-none`, so it is inert to
   * the pointer and absent from the accessibility tree - but duplicate ids are
   * still duplicate ids, so they are stripped.
   */
  const createCarry = () => {
    const rect = source.getBoundingClientRect()
    grabOffsetX = startX - rect.left
    grabOffsetY = startY - rect.top

    carryEl = document.createElement("div")
    carryEl.setAttribute("data-slot", "filters-drag-carry")
    // Hidden from assistive technology, and inert to the pointer. It is a
    // picture of the row, and a second copy of the row's controls in the
    // accessibility tree would double every button the builder owns.
    carryEl.setAttribute("aria-hidden", "true")
    // `data-drop-invalid` rather than a toggled class name, so the whole style
    // stays one static string Tailwind can see at build time. A class assembled
    // at runtime is a class the scanner never emits.
    //
    // MUTED, and that is half of the drop language the builder speaks. The
    // thing in flight is a picture of a row and not a row, so it is drawn
    // quietly; every accent on screen during a gesture then belongs to a
    // DESTINATION, which is the only thing the user is choosing.
    //
    // The invalid state is a DESTRUCTIVE RING rather than a dashed border, and
    // that is a deliberate swap. Dashed means "somewhere a row can land", so a
    // dashed clone would say the clone was a drop target.
    // THE ROW, LIFTED. No border and no ring: the clone already contains the
    // row's own controls, each with its own boundary, so a box drawn around
    // them adds a second frame the original never had and makes the thing in
    // flight look like a different object from the thing that was picked up.
    // The surface a panel row sits on, and nothing else. A shadow was the last
    // thing separating the copy from the row it copies, and it read as a card
    // lifting off the page rather than as a row being moved within it; the
    // faded original underneath is already what says which one is
    // live.
    //
    // The invalid state is the one exception, and it earns a ring: there is
    // nothing else on screen to say a release here would do nothing.
    carryEl.className =
      "pointer-events-none fixed " +
      "top-0 left-0 z-100 " +
      "opacity-95 will-change-transform " +
      "data-drop-invalid:ring-destructive/70 data-drop-invalid:ring-2 " +
      "data-drop-invalid:opacity-60"
    // The row's own box, frozen. Without a width the fixed-position clone
    // shrink-wraps its content and stops looking like the row it came from;
    // without a height a group's clone would keep growing as its subtree wraps
    // at a width nothing is constraining.
    //
    // ONLY WHEN THE MEASUREMENT IS REAL. `getBoundingClientRect` answers zero
    // for a row in a document that is not being laid out - a hidden tab, a
    // `display: none` ancestor, a print sheet - and pinning a copy to `0px`
    // makes the one thing the user is dragging invisible. Falling through to no
    // explicit size lets it shrink-wrap, which is a worse picture than the row
    // and a far better one than nothing.
    // The carry is a bare anchor now: the clipping box below owns the size, and
    // a fixed box with no overflow lets the badge overhang it.
    carryEl.style.position = "fixed"

    const clone = source.cloneNode(true) as HTMLElement
    // The source is faded while it is in flight; its copy must not
    // inherit that or the carry would be a ghost of a ghost.
    delete clone.dataset.dragging
    delete clone.dataset.dropNoop
    delete clone.dataset.dropEdge
    if (rect.width > 0) clone.style.width = `${rect.width}px`

    /*
      SANITIZED, and each of these is a way a picture can be mistaken for the
      thing it is a picture of.

      IDENTITY: the clone carries `data-slot="filter-row"` and `data-node-id`,
      and it lives on `<body>` - outside every scope the builder queries. Left
      alone, two elements claim one node id and every unscoped row lookup finds
      one row too many, one of them inert.

      FOCUS: a row is made of real buttons and a real input, and `aria-hidden`
      does not take an element out of the tab order. A Tab during a drag would
      land inside a picture; worse, `aria-hidden` around a focused element is
      the one thing the attribute must never do.

      IDS: duplicated wholesale by `cloneNode`, and an `aria-activedescendant`
      or a label `for` that resolves to the copy resolves to nothing real.
    */
    const strip = (el: HTMLElement) => {
      el.removeAttribute("id")
      el.removeAttribute("data-node-id")
      el.removeAttribute("data-filter-cell")
      if (el.dataset.slot === "filter-row") el.removeAttribute("data-slot")
      // Natively focusable or explicitly so. `-1` rather than removing it: the
      // attribute is also how the roving scheme marks its own cells, and a row
      // copied mid-gesture has one cell at `0`.
      el.setAttribute("tabindex", "-1")
    }
    strip(clone)
    for (const el of clone.querySelectorAll<HTMLElement>("*")) strip(el)

    /*
      The CLIPPING box is the inner one, not the carry.

      `overflow-hidden` used to sit on the carry itself, which is also the
      badge's containing block - so the copy badge, deliberately positioned at
      `-6px, -6px` to overhang the corner, was cut off by the very element it
      overhangs. The "+" was invisible for the whole gesture, and jsdom does no
      layout so the test could not see it either. Splitting the two means the
      clone still gets its rounded, clipped box and the badge still overhangs.
    */
    const clip = document.createElement("div")
    clip.className = "bg-background overflow-hidden rounded-md"
    if (rect.width > 0) clip.style.width = `${rect.width}px`
    if (rect.height > 0) clip.style.height = `${rect.height}px`
    clip.appendChild(clone)
    carryEl.appendChild(clip)

    badgeEl = document.createElement("span")
    badgeEl.setAttribute("data-slot", "filters-drag-copy")
    badgeEl.className =
      "bg-primary text-primary-foreground absolute -end-1.5 -top-1.5 flex " +
      "size-4 items-center justify-center rounded-full text-[10px] leading-none"
    badgeEl.textContent = "+"
    // The affordance has to be legible BEFORE the release, or Alt is a gesture
    // the user can only discover by getting it wrong.
    badgeEl.hidden = !copy
    carryEl.appendChild(badgeEl)

    // <body>, not the panel. `position: fixed` resolves against the nearest
    // ancestor that establishes a containing block, and a transform, a filter
    // or a `content-visibility` on any wrapper silently becomes that ancestor -
    // this repo has already shipped a row-drag clone that jumped for exactly
    // that reason. The body is the one parent no panel can turn into one.
    document.body.appendChild(carryEl)
    positionCarry(startX, startY)
  }

  /**
   * Below and to the right of the pointer, at a fixed offset.
   *
   * NOT the grab offset, which is what it used to preserve. The grip is
   * vertically centred in its row, so a carry that kept the offset always
   * straddled the row the pointer was on - which is the row the between-rows
   * indicator paints on. Trailing the pointer the way a native drag image does
   * leaves the slot, the tinted neighbour and the ringed card all uncovered,
   * and it costs the picture nothing: the carry is a one-line chip, so there is
   * no shape left for it to line up with.
   */
  const positionCarry = (x: number, y: number) => {
    if (!carryEl) return
    // THE GRAB OFFSET, not a fixed nudge off the pointer.
    //
    // A fixed `+12, +12` was right while the carry was a one-line chip: a small
    // label trailing the pointer covers nothing and has no shape to line up
    // with. A full-size copy of the row does have one, and anchoring its top
    // left to the pointer threw it a row's width to the right - the grip is at
    // the row's trailing edge, so the clone hung off the panel entirely.
    //
    // Keeping the distance from the pointer to the row's own top left means the
    // copy sits exactly where the row was when it was picked up, and the point
    // under the finger stays the point that was grabbed.
    carryEl.style.transform = `translate3d(${snapToPixel(x - grabOffsetX)}px, ${snapToPixel(y - grabOffsetY)}px, 0)`
  }

  /**
   * One place that owns the cursor, because two things decide it.
   *
   * Alt says what the drop MEANS and the resolution says whether there is one,
   * and the second outranks the first: `copy` over nothing is still nothing.
   */
  const paintCursor = () => {
    if (!active) return
    document.body.style.cursor =
      dropState === "none" ? "no-drop" : copy ? "copy" : "grabbing"
  }

  // Deliberately NOT guarded on `dropState === next`. The first resolution of a
  // gesture is routinely `"none"`, which is also the value the state starts at,
  // so a guard here left the very first frame of a drag onto nothing wearing no
  // mark at all. Writing the same attribute twice costs a no-op `delete` and one
  // attribute set, which is what `paint` beside it already does every frame.
  const setDropState = (next: typeof dropState) => {
    dropState = next
    // On the SOURCE, not on a target, because "it stays here" is a statement
    // about the row being carried. The row is already dimmed as the one in
    // flight; this is what brings it back to full strength to say so.
    if (next === "noop") source.dataset.dropNoop = ""
    else delete source.dataset.dropNoop
    // And on the CARRY, because when nothing is under the pointer there is no
    // target left to mark - the only thing on screen is the clone.
    if (carryEl) {
      if (next === "none") carryEl.dataset.dropInvalid = ""
      else delete carryEl.dataset.dropInvalid
    }
    paintCursor()
  }

  const setCopy = (next: boolean) => {
    if (copy === next) return
    copy = next
    if (badgeEl) badgeEl.hidden = !next
    paintCursor()
    // Alt changes the ANSWER, not just the cursor: a release beside yourself is
    // a no-op while moving and a duplicate-in-place while copying, so the state
    // has to be re-derived rather than merely repainted.
    if (lastEvent) hitTest(lastEvent.clientX, lastEvent.clientY)
  }

  /* ------------------------------- resolution ------------------------------ */

  const hitTest = (x: number, y: number) => {
    if (!surface) return
    // One subtraction instead of a re-measure: the cached rects were taken at
    // the start scroll position, so a scrolled container shifts the pointer's
    // coordinate in that frame rather than moving every box.
    //
    // READ OFF THE ELEMENT, every time. See `Surface.viewport`: a mirror only
    // knows about the scrolling this engine performs, and the scroll that
    // matters most is the one it does not - the user's own, with the other
    // hand, while the drag is held.
    const scrolled = surface.viewport?.scrollTop ?? surface.startScrollTop
    const drift = scrolled - surface.startScrollTop
    const resolved = resolveFilterDrop(surface.zones, surface.rows, x, y + drift)
    const noop = isFilterDropNoop(resolved, origin, copy)
    // A no-op is committed as NOTHING rather than as a move the tree would
    // discard, so the panel emits no query, announces no reorder and moves no
    // focus for a gesture that changed the query not at all.
    hit = noop ? null : resolved
    paint(surface, hit)
    setDropState(noop ? "noop" : hit ? "ok" : "none")
  }

  const autoScroll = (y: number) => {
    if (rafScroll) cancelAnimationFrame(rafScroll)
    rafScroll = 0
    const viewport = surface?.viewport
    const rect = surface?.viewportRect
    if (!viewport || !rect) return

    const edge = FILTER_DND_ACTIVATION.autoScrollEdgePx
    const step = FILTER_DND_ACTIVATION.autoScrollMaxStepPx
    let delta = 0
    if (y >= rect.top && y < rect.top + edge) {
      delta = -step * ((rect.top + edge - y) / edge)
    } else if (y <= rect.bottom && y > rect.bottom - edge) {
      delta = step * Math.min(1, (y - (rect.bottom - edge)) / edge)
    }
    if (delta === 0) return

    const tick = () => {
      // Write then read back, and the read-back is what STOPS the loop: the
      // browser clamps at the scroll extent, so a panel parked at its limit
      // would otherwise keep asking for a frame it can no longer use. The hit
      // test corrects itself from the element either way, so there is nothing
      // here to keep in step.
      const before = viewport.scrollTop
      viewport.scrollTop = before + delta
      if (viewport.scrollTop === before) return
      if (lastEvent) hitTest(lastEvent.clientX, lastEvent.clientY)
      rafScroll = requestAnimationFrame(tick)
    }
    rafScroll = requestAnimationFrame(tick)
  }

  /**
   * Re-resolve on a scroll this engine did not cause.
   *
   * A pointer that has not moved fires no `pointermove`, so a wheel or a
   * trackpad two-finger mid-drag would otherwise leave the last painted answer
   * on screen while the rows slid out from under it. Passive, because nothing
   * here calls `preventDefault` and a non-passive listener on a scroller is a
   * frame of jank per notch.
   *
   * The autoScroll tick hit tests as well and that overlap is deliberate: this
   * is arithmetic over boxes already measured, and one redundant pass per frame
   * is cheaper than a rule about who owns the repaint.
   */
  const onViewportScroll = () => {
    if (!active || !lastEvent) return
    hitTest(lastEvent.clientX, lastEvent.clientY)
  }

  /* -------------------------------- lifecycle ------------------------------ */

  const activate = () => {
    if (active) return
    active = true
    surface = collectSurface(root, source)

    surface.viewport?.addEventListener("scroll", onViewportScroll, {
      passive: true,
    })
    source.dataset.dragging = ""
    document.body.style.cursor = copy ? "copy" : "grabbing"
    document.body.style.userSelect = "none"
    createCarry()
    // Armed with the GESTURE, not with the press: a press that never travels
    // far enough holds no overlay, no body style and no listener to strand.
    window.addEventListener("blur", onWindowBlur)
  }

  // Idempotent. pointerup, pointercancel, Escape, window blur and the panel's
  // own teardown can all race; whichever lands first wins and the rest no-op.
  const cleanup = () => {
    if (finished) return
    finished = true
    activeCancels.delete(cancel)
    window.removeEventListener("pointermove", onPointerMove)
    window.removeEventListener("pointerup", onPointerUp)
    window.removeEventListener("pointercancel", onPointerCancel)
    window.removeEventListener("keydown", onKeyDown, true)
    window.removeEventListener("keyup", onKeyUp, true)
    window.removeEventListener("blur", onWindowBlur)
    surface?.viewport?.removeEventListener("scroll", onViewportScroll)
    if (touchTimer) clearTimeout(touchTimer)
    if (rafScroll) cancelAnimationFrame(rafScroll)
    if (surface) paint(surface, null)
    delete source.dataset.dragging
    delete source.dataset.dropNoop
    carryEl?.remove()
    carryEl = null
    badgeEl = null
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
  }

  /**
   * Cancel is a bare teardown, and that is the whole story.
   *
   * Nothing has been committed at any point during the gesture: the tree is
   * mutated once, on release, from the resolved target. So "restore the
   * original order" needs no snapshot and no undo - the original order is what
   * has been on screen the entire time.
   */
  const cancel = () => {
    if (active) lastDragEndedAt = performance.now()
    cleanup()
  }

  const onWindowBlur = () => cancel()

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && active) {
      // Stopped, or the popover the builder may be living in closes underneath
      // the gesture and takes the panel the drop was aimed at with it.
      e.stopPropagation()
      e.preventDefault()
      cancel()
      return
    }
    if (e.key === "Alt") setCopy(true)
  }

  // Alt tracked on its own keys as well as on the pointer, because a user who
  // reaches for the modifier without moving the mouse gets no pointermove, and
  // a badge that appears only once you jiggle is a badge nobody trusts.
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === "Alt") setCopy(false)
  }

  const onPointerMove = (e: PointerEvent) => {
    // A second finger must not drive, or cancel the pending long press of, the
    // gesture this pointer started.
    if (e.pointerId !== pointerId) return
    lastEvent = e

    if (!active) {
      const distance = Math.hypot(e.clientX - startX, e.clientY - startY)
      if (isTouch) {
        // Long press pending: travelling past tolerance means the user is
        // scrolling the panel, so the press must stay a scroll.
        if (distance > FILTER_DND_ACTIVATION.touchTolerancePx) cancel()
        return
      }
      if (distance < FILTER_DND_ACTIVATION.moveDistancePx) return
      activate()
    }

    setCopy(e.altKey)
    positionCarry(e.clientX, e.clientY)
    hitTest(e.clientX, e.clientY)
    autoScroll(e.clientY)
  }

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return
    const landed = active ? hit : null
    const wasCopy = copy
    cleanup()
    if (!active) return

    lastDragEndedAt = performance.now()
    // The trailing click belongs to the gesture, not to whatever it ended over.
    window.addEventListener("click", suppressTrailingClick, true)

    if (!landed) return
    options.onDrop(nodeId, {
      parentId: landed.target.parentId,
      index: landed.target.index,
      copy: wasCopy,
    })
  }

  const onPointerCancel = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return
    cancel()
  }

  window.addEventListener("pointermove", onPointerMove)
  window.addEventListener("pointerup", onPointerUp)
  window.addEventListener("pointercancel", onPointerCancel)
  window.addEventListener("keydown", onKeyDown, true)
  window.addEventListener("keyup", onKeyUp, true)
  activeCancels.add(cancel)

  if (isTouch) {
    touchTimer = setTimeout(() => {
      activate()
      if (lastEvent) {
        positionCarry(lastEvent.clientX, lastEvent.clientY)
        hitTest(lastEvent.clientX, lastEvent.clientY)
      }
    }, FILTER_DND_ACTIVATION.touchDelayMs)
  }
}

/* -------------------------------------------------------------------------- */
/*                                    Hook                                    */
/* -------------------------------------------------------------------------- */

/**
 * Wires one builder's drag handles.
 *
 * Returns the props a handle spreads. Only `onPointerDown`: the handle is a
 * real button that Tab reaches and Alt+arrow reorders from, so it must not also
 * be `draggable`, which would hand the browser's own HTML5 drag - with its
 * uncontrollable ghost, its lack of any copy affordance and its inability to
 * report a drop into a nested target - a race with this one.
 */
export function useFilterRowDrag(options: FilterRowDragOptions) {
  // Read at gesture time, not captured at wiring time, so the handler identity
  // is stable for the life of the builder and a memoized row never re-renders
  // because a parent re-created a callback.
  const latest = React.useRef(options)
  React.useEffect(() => {
    latest.current = options
  })

  // A gesture outlives its row by design, but it must never outlive the panel:
  // its listeners are on `window` and its carry is on `document.body`, neither
  // of which React unmounts.
  React.useEffect(() => cancelActiveFilterDrags, [])

  return React.useCallback(
    (nodeId: string) => ({
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        if (latest.current.disabled) return
        // Primary button only. A right press opens a context menu, and a drag
        // armed underneath it never sees the release that would end it.
        if (event.button !== 0) return
        startDrag(event, nodeId, latest.current)
      },
    }),
    []
  )
}