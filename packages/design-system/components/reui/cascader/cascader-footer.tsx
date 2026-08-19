// @ts-nocheck
"use client"

import * as React from "react"
import { useCascaderActions } from "@pi-dash/design-system/components/reui/cascader/cascader-context"
import {
  CASCADER_ACTION_CLASS,
  CascaderGroup,
  CascaderLabel,
} from "@pi-dash/design-system/components/reui/cascader/cascader-item"
import {
  CASCADER_LIST_PAD_CLASS,
  getCascaderFooterStops,
  isCascaderRtl,
} from "@pi-dash/design-system/components/reui/cascader/cascader-lib"
import type { CascaderActionItem } from "@pi-dash/design-system/components/reui/cascader/cascader-types"
import { Popover as PopoverPrimitive } from "@base-ui/react"
import { useDirection } from "@base-ui/react/direction-provider"

import { cn } from "@pi-dash/design-system/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"

/**
 * The pinned footer, and the side-anchored flyout a footer row can open.
 *
 * ## What this is for
 *
 * COMMANDS. "Create new attribute", "Import from CSV", "Manage fields". It is
 * not a fourth navigation mode: drill, columns and tree stay the only ways to
 * move through the data tree, and nothing rendered here ever joins the
 * selection, the filter set or the highlight. The arrows still reach it - the
 * list hands REAL focus down from its last row and takes it back from the
 * strip's ends - but a command never becomes an option: it cannot be filtered
 * away, and Enter on it can never commit a row.
 *
 * ## Why the flyout is a `Popover` inside `Combobox.Popup`
 *
 * A second floating layer inside a combobox popup normally fights the combobox
 * on four fronts at once - it gets `aria-hidden`, the click that opens it reads
 * as an outside press, the focus that lands in it reads as a focus-out, and the
 * popup's `overflow-hidden` clips it. Rendering a Base UI `Popover` as a REACT
 * CHILD of `Combobox.Popup`, with its OWN `Portal` and NO `container` prop,
 * answers all four: Base UI resolves a nested portal's container to the parent
 * portal node, so the flyout is a sibling of the combobox popup in the DOM (not
 * clipped, not `aria-hidden`) while staying a descendant in the React tree,
 * which is what the combobox's outside-press and focus-out whitelists are
 * computed from.
 *
 * Three things that follow from that, each of which is load-bearing:
 *
 * 1. **Escape.** `Combobox` builds no `FloatingTree`, so the flyout is not
 *    consulted first and one Escape would dismiss both. `CascaderSubmenu`
 *    registers itself with the root, whose `onOpenChange` cancels an
 *    `escape-key` close while any flyout is open. Escape then closes the
 *    flyout, and the next one closes the cascader.
 * 2. **Enter.** `Combobox.List`'s keydown handler clicks `listRef[activeIndex]`
 *    on Enter, so anything rendered INSIDE the list would commit a row. The
 *    footer is a sibling of `CascaderList` inside the popup, and the flyout's
 *    key handlers stop propagating, so neither can reach it.
 * 3. **`Popover.Positioner` throws without a `Portal`,** and `modal` stays
 *    `false` so the combobox keeps its own dismissal behaviour.
 */

/* -------------------------------------------------------------------------- */
/*                                   Footer                                   */
/* -------------------------------------------------------------------------- */

/**
 * Keys the option list acts on, swallowed at the footer boundary.
 *
 * A press or a key inside the footer belongs to the footer. Escape and Tab are
 * deliberately absent: Escape has to reach the root (which decides between
 * closing a flyout and closing the popup) and Tab has to keep moving focus.
 *
 * The vertical arrows are swallowed AND given the strip's own behaviour below:
 * the footer is the bottom of the cascader's arrow model, entered from the
 * list's last row, so Up and Down have to keep meaning "previous and next"
 * once focus is in here rather than going dead.
 */
const FOOTER_SWALLOWED_KEYS = new Set([
  "Enter",
  " ",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
])

export type CascaderFooterProps = React.ComponentProps<"div">

/**
 * Actions pinned below the list.
 *
 * Render it as a SIBLING of `CascaderList` inside `CascaderPanel`. With no
 * children it draws the root's `actions` prop; with children it draws those,
 * so hand-composed `CascaderAction` and `CascaderSubmenu` rows keep the
 * footer's layout. It renders nothing at all when there is neither, rather
 * than reserving an empty strip under every panel.
 */
function CascaderFooter({
  className,
  children,
  onKeyDown,
  ...props
}: CascaderFooterProps) {
  const { actions, labels } = useCascaderActions()
  const hasChildren = React.Children.count(children) > 0

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event)
      if (event.defaultPrevented) return
      // The footer is not part of the option ring, so the list must never act
      // on a key pressed inside it.
      if (!FOOTER_SWALLOWED_KEYS.has(event.key)) return
      event.stopPropagation()

      // The strip's own vertical movement. The list hands off here from its
      // last row (see `CascaderInput`), and this is the way back: Down walks
      // the commands, Up walks them in reverse, and EITHER end returns focus
      // to the search field - Up from the first command, Down past the last.
      // The list highlight was cleared by the hand-off (one active row at a
      // time, never two), so from the field ArrowUp resumes at the last row
      // and ArrowDown starts at the first - the full ring, all of it Base
      // UI's own empty-highlight behaviour.
      //
      // Down wraps to the FIELD rather than to the first command or the first
      // row: re-entering the strip it just left would trap the arrows in the
      // footer, and re-entering the list would need the highlight moved
      // imperatively, which Base UI does not expose.
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
      const footer = event.currentTarget
      const stops = getCascaderFooterStops(footer)
      const active = document.activeElement as HTMLElement | null
      const index = active ? stops.indexOf(active) : -1
      if (index === -1) return
      event.preventDefault()
      const next =
        event.key === "ArrowDown" ? stops[index + 1] : stops[index - 1]
      if (next) {
        next.focus()
        return
      }
      if (event.key === "ArrowUp" && index > 0) return
      footer
        .closest<HTMLElement>('[data-slot="cascader-panel"]')
        ?.querySelector<HTMLElement>('[data-slot="cascader-input"]')
        ?.focus()
    },
    [onKeyDown]
  )

  if (!hasChildren && actions.length === 0) return null

  return (
    <div
      data-slot="cascader-footer"
      // A named group rather than a bare div: without it a screen reader
      // reaches the actions with nothing to say they are not more options.
      role="group"
      aria-label={labels.actionsLabel}
      onKeyDown={handleKeyDown}
      className={cn(
        "border-border/60 flex shrink-0 flex-col gap-0.5 border-t",
        // The LIST's padding, not a flat `p-1`. The footer's rows carry the
        // same per-style inset the option rows do, so with a padding of its own
        // the two columns of text only lined up in the five styles whose list
        // padding happens to be 4px: luma and sera were 2px out and lyra, whose
        // list has no padding at all, was 4px out. It also gives a separator in
        // here a number to cancel.
        CASCADER_LIST_PAD_CLASS,
        "p-(--cascader-list-pad,4px)",
        className
      )}
      {...props}
    >
      {hasChildren ? children : <CascaderFooterActions actions={actions} />}
    </div>
  )
}

/**
 * The data-driven path. Entries with `items` become submenu triggers, the rest
 * become plain actions.
 */
function CascaderFooterActions({ actions }: { actions: CascaderActionItem[] }) {
  return (
    <>
      {actions.map((action, i) =>
        action.items?.length ? (
          <CascaderSubmenu key={actionKey(action, i)}>
            <CascaderSubmenuTrigger
              icon={action.icon}
              disabled={action.disabled}
            >
              {action.label}
            </CascaderSubmenuTrigger>
            <CascaderSubmenuContent>
              <CascaderActionList items={action.items} />
            </CascaderSubmenuContent>
          </CascaderSubmenu>
        ) : (
          <CascaderAction
            key={actionKey(action, i)}
            icon={action.icon}
            disabled={action.disabled}
            onSelect={action.onSelect}
          >
            {action.label}
          </CascaderAction>
        )
      )}
    </>
  )
}

/** A label is only a usable key when it is a string; the index is the fallback. */
function actionKey(action: CascaderActionItem, index: number): string {
  if (action.value != null) return action.value
  if (typeof action.label === "string") return action.label
  return String(index)
}

/**
 * Consecutive entries that share a `group`, as runs.
 *
 * A run rather than a bucket: `group` describes the entry ahead of it in the
 * array, so two separated runs carrying the same name stay two runs and the
 * author's order survives. Entries with no `group` form their own unnamed run,
 * which is what an ungrouped list is - one run of everything.
 */
function groupActionRuns(
  items: CascaderActionItem[]
): { group?: string; items: CascaderActionItem[] }[] {
  const runs: { group?: string; items: CascaderActionItem[] }[] = []
  for (const item of items) {
    const last = runs[runs.length - 1]
    if (last && last.group === item.group) last.items.push(item)
    else runs.push({ group: item.group, items: [item] })
  }
  return runs
}

/**
 * Flyout body for a data-driven submenu: the entries, with a heading above
 * each RUN of entries that share a `group`.
 *
 * A named run is a real `CascaderGroup`, so its heading is the group's
 * accessible name rather than a line of text sitting above it. An unnamed run
 * is not wrapped at all - a `role="group"` with nothing to call it is noise in
 * the accessibility tree, and the ungrouped case is the common one.
 */
function CascaderActionList({ items }: { items: CascaderActionItem[] }) {
  const { close } = useCascaderSubmenu()
  const runs = React.useMemo(() => groupActionRuns(items), [items])

  const renderAction = (item: CascaderActionItem, i: number) => (
    <CascaderAction
      key={actionKey(item, i)}
      icon={item.icon}
      disabled={item.disabled}
      onSelect={() => {
        item.onSelect?.()
        // A command list closes behind the command. Leaving it open would
        // imply the entries are toggles.
        close()
      }}
    >
      {item.label}
    </CascaderAction>
  )

  return (
    <>
      {runs.map((run, runIndex) =>
        run.group ? (
          <CascaderGroup key={`${run.group}-${runIndex}`} className="gap-0.5">
            <CascaderLabel>{run.group}</CascaderLabel>
            {run.items.map(renderAction)}
          </CascaderGroup>
        ) : (
          <React.Fragment key={`run-${runIndex}`}>
            {run.items.map(renderAction)}
          </React.Fragment>
        )
      )}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*                                   Action                                   */
/* -------------------------------------------------------------------------- */

export interface CascaderActionProps extends Omit<
  React.ComponentProps<"button">,
  "onSelect"
> {
  /** Leading icon. */
  icon?: React.ReactNode
  /** Fires on press. Runs after `onClick`, and not at all when it is disabled. */
  onSelect?: () => void
}

/**
 * One footer command, shaped like a row and deliberately NOT one.
 *
 * A real `<button>`, never a `Combobox.Item`: an item would join the arrow-key
 * ring, appear in `filteredItems`, and vanish the moment a query matched
 * nothing - which is exactly when "Create new attribute" is most useful. It
 * borrows `.cn-combobox-item` for its look so the footer and the list agree
 * about height, padding and hover in all eight styles, and nothing else.
 *
 * ## Disabled is `aria-disabled`, never the native attribute
 *
 * A natively disabled `<button>` is not a tab stop, and the panel's own Tab
 * order is computed from real tab stops (`button:not([disabled])`). So a footer
 * whose ONLY row is a disabled command had NO stop after the search field:
 * `getCascaderTabTarget` returned null, `CascaderPanel` handed the key back to
 * the browser, and the footer was not reachable at all. Measured on
 * `c-cascader-8`, whose single "Reset selection" row is disabled until
 * something is selected - which is to say, on first open, every time.
 *
 * ARIA's authoring practices answer this the other way round: a disabled
 * command in a menu or a toolbar stays FOCUSABLE and announces itself as
 * disabled, precisely so a keyboard user can discover that it exists and learn
 * what would enable it. That is what this does, at the cost of having to
 * re-implement by hand the three things the native attribute did for free:
 *
 * 1. Pointer activation. An `aria-disabled` button still fires click, so
 *    without the guard in `handleClick` the command RUNS.
 * 2. Keyboard activation. Enter and Space activate a button natively, so they
 *    are prevented rather than merely ignored.
 * 3. The greyed-out look, which now keys off `aria-disabled` in
 *    `CASCADER_ACTION_CLASS` instead of `:disabled`.
 */
function CascaderAction({
  className,
  icon,
  children,
  onSelect,
  onClick,
  onKeyDown,
  disabled,
  ...props
}: CascaderActionProps) {
  // Set by `CascaderSubmenuContent`. In the footer this is a plain button in
  // the Tab ring; inside a flyout it is a `menuitem` under roving focus, and
  // the two must not be confused - a `menuitem` that keeps `tabindex="0"` puts
  // every command in the document's Tab order and defeats the arrow keys.
  const inMenu = React.useContext(CascaderMenuContext)

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      // Before the consumer's own handler, not after it: a disabled command
      // must not run ANY of the three (`onClick`, `onSelect`, the default),
      // which is what the native attribute used to guarantee.
      if (disabled) {
        event.preventDefault()
        return
      }
      onClick?.(event)
      if (event.defaultPrevented) return
      onSelect?.()
    },
    [disabled, onClick, onSelect]
  )

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) {
        // The two keys a `<button>` activates on, and only those. Tab, Escape
        // and the arrows a flyout moves on are left entirely alone - keeping
        // the row reachable is the whole point, so it must also stay
        // escapable.
        if (event.key === "Enter" || event.key === " ") event.preventDefault()
        return
      }
      onKeyDown?.(event)
    },
    [disabled, onKeyDown]
  )

  return (
    <button
      type="button"
      data-slot="cascader-action"
      // Conditional spread, never an explicit `undefined`: `false` would
      // publish `aria-disabled="false"` on every enabled command, and
      // `data-disabled` is a presence hook.
      {...(disabled ? { "aria-disabled": true, "data-disabled": "" } : null)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      // Conditional spread, never an explicit `undefined`, so a consumer's own
      // `role` or `tabIndex` in `props` still wins on the footer path.
      {...(inMenu ? { role: "menuitem" as const, tabIndex: -1 } : null)}
      className={cn(CASCADER_ACTION_CLASS, className)}
      {...props}
    >
      {icon ? (
        <span
          data-slot="cascader-action-icon"
          className="text-muted-foreground flex shrink-0 items-center justify-center"
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-start">{children}</span>
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Submenu                                   */
/* -------------------------------------------------------------------------- */

interface CascaderSubmenuContextValue {
  /** The footer row the flyout is anchored to. */
  rowRef: React.RefObject<HTMLButtonElement | null>
  open: boolean
  setOpen: (open: boolean) => void
  close: () => void
  /** Names the flyout: a menu is labelled by the control that opens it. */
  triggerId: string
  /**
   * Whether the pending open came from the KEYBOARD.
   *
   * Base UI reports an `openType` to `initialFocus`, but it classifies the
   * interaction from its OWN handlers, and the arrow that opens a submenu is
   * intercepted here and turned into a programmatic `setOpen` - which arrives
   * as a pointer open. Measured: focus landed on the popup, not the first
   * entry. So the timing comes from Base UI and the classification comes from
   * the trigger. A ref, because it is read during the focus phase and must
   * never cause a render.
   */
  keyboardRef: React.RefObject<boolean>
}

/**
 * Marks the subtree INSIDE a flyout.
 *
 * `CascaderAction` serves two places with the same markup: the footer, where
 * it is a plain button in the Tab ring, and the flyout, where it has to be a
 * `menuitem` under roving focus. The difference is the container, so the
 * container is what publishes it.
 */
const CascaderMenuContext = React.createContext(false)

/**
 * Every entry a menu's roving focus may land on, in DOM order.
 *
 * Read from the DOM rather than a registry. The entries are whatever the
 * consumer composed - actions, grouped runs, their own components - and a
 * registry would need every one of them to opt in.
 *
 * A DISABLED `CascaderAction` is INCLUDED, deliberately, and the selector is
 * unchanged for it: the row now carries `aria-disabled` rather than the native
 * attribute, so it satisfies `:not([disabled])` on its own. That is ARIA's
 * "focusable disabled menu item" rule, and it is the same rule the footer's Tab
 * ring follows one level up - a command a user cannot arrow onto is a command
 * they cannot discover.
 *
 * `:not([disabled])` still earns its place. It is now about the OTHER kind of
 * entry: a consumer's own natively disabled `<button role="menuitem">` cannot
 * take focus at all, so including it would leave the roving ring apparently
 * stuck on a row that never highlights.
 */
function menuItems(popup: HTMLElement | null): HTMLElement[] {
  if (!popup) return []
  return Array.from(
    popup.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')
  )
}

const CascaderSubmenuContext = React.createContext<
  CascaderSubmenuContextValue | undefined
>(undefined)

/**
 * The flyout's own state, for anything rendered inside it. `close()` is the
 * one a custom entry usually wants.
 */
export function useCascaderSubmenu(): CascaderSubmenuContextValue {
  const context = React.useContext(CascaderSubmenuContext)
  if (!context) {
    throw new Error("useCascaderSubmenu must be used within a CascaderSubmenu")
  }
  return context
}

export interface CascaderSubmenuProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

/**
 * A footer row plus the flyout it opens.
 *
 * Registers itself with the cascader root while it is open, which is what
 * turns one Escape into two: the root cancels its own `escape-key` close while
 * a flyout is registered, so the flyout goes first and the popup goes second.
 * The registration is cleared in an EFFECT, deliberately - the guard runs
 * during the same event that closed the flyout, and by then the flyout must
 * still read as open or that Escape would close both after all.
 */
function CascaderSubmenu({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: CascaderSubmenuProps) {
  const { setFlyoutOpen } = useCascaderActions()
  const key = React.useId()
  const triggerId = React.useId()
  const rowRef = React.useRef<HTMLButtonElement | null>(null)
  const keyboardRef = React.useRef(false)
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen)
  const open = openProp ?? uncontrolled

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp == null) setUncontrolled(next)
      onOpenChange?.(next)
    },
    [openProp, onOpenChange]
  )

  const close = React.useCallback(() => setOpen(false), [setOpen])

  React.useEffect(() => {
    setFlyoutOpen(key, open)
    return () => setFlyoutOpen(key, false)
  }, [setFlyoutOpen, key, open])

  const context = React.useMemo<CascaderSubmenuContextValue>(
    () => ({ rowRef, open, setOpen, close, triggerId, keyboardRef }),
    [open, setOpen, close, triggerId]
  )

  return (
    <CascaderSubmenuContext.Provider value={context}>
      <PopoverPrimitive.Root
        open={open}
        onOpenChange={setOpen}
        // NEVER modal. A modal popover locks page scroll and disables pointer
        // interaction outside itself, which here means the combobox that owns
        // it.
        modal={false}
      >
        {children}
      </PopoverPrimitive.Root>
    </CascaderSubmenuContext.Provider>
  )
}

export interface CascaderSubmenuTriggerProps extends Omit<
  React.ComponentProps<"button">,
  "onSelect"
> {
  icon?: React.ReactNode
}

/**
 * Base UI's popover trigger extends its click event with the handler-veto hook
 * `mergeProps` installs, and the veto is the only in-band way to stop
 * `useClick` from opening the flyout. Derived from the prop rather than
 * restated, so a Base UI bump cannot make the two drift.
 */
type CascaderSubmenuTriggerClickEvent = Parameters<
  NonNullable<PopoverPrimitive.Trigger.Props["onClick"]>
>[0]

/**
 * The footer row that opens the flyout. Also the flyout's anchor.
 *
 * `aria-haspopup="menu"` rather than the `dialog` Base UI's popover trigger
 * would otherwise announce: what opens here is a list of commands with roving
 * focus, and the promise a screen reader makes to its user has to match what
 * the arrow keys will actually do.
 *
 * ## `disabled` is handled here, not forwarded
 *
 * `Popover.Trigger` runs its `disabled` prop through Base UI's `useButton`,
 * which - for a native `<button>`, with no `focusableWhenDisabled` escape hatch
 * on this component - writes the NATIVE `disabled` attribute. That is exactly
 * the attribute that takes the row out of the panel's Tab ring, so forwarding
 * it would reproduce on this row the defect `CascaderAction` above just fixed:
 * a footer whose only row is a disabled submenu trigger would be unreachable.
 * The two rows sit in the same strip and must not express the same state two
 * different ways, one of which is silently skipped.
 *
 * So the prop is intercepted, published as `aria-disabled` plus a
 * `data-disabled` hook, and the three routes that would still open the flyout
 * are closed by hand: the arrow keys (this component's own handler), Enter and
 * Space (prevented before they can synthesise a click), and the click itself
 * (`preventBaseUIHandler`, because `useClick` does not consult
 * `defaultPrevented`).
 */
function CascaderSubmenuTrigger({
  className,
  icon,
  children,
  onKeyDown,
  onClick,
  disabled,
  ...props
}: CascaderSubmenuTriggerProps) {
  const { labels } = useCascaderActions()
  const { rowRef, setOpen, triggerId, keyboardRef } = useCascaderSubmenu()
  const direction = useDirection()

  const handleClick = React.useCallback(
    (event: CascaderSubmenuTriggerClickEvent) => {
      if (disabled) {
        // `mergeProps` calls handlers right to left, so this one runs BEFORE
        // Base UI's own and can drop it. Nothing else stops `useClick`.
        event.preventDefault()
        event.preventBaseUIHandler()
        return
      }
      onClick?.(event)
    },
    [disabled, onClick]
  )

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) {
        // Enter and Space activate a native button, and activation is what
        // opens the flyout. Everything else is left alone so the row stays
        // reachable, escapable and tabbable-through.
        if (event.key === "Enter" || event.key === " ") event.preventDefault()
        return
      }

      onKeyDown?.(event)
      if (event.defaultPrevented) return

      // The key that opens a side-anchored submenu is the one that points AT
      // it, which flips with the writing direction. ArrowDown deliberately
      // does NOT open it any more: the footer is a vertical strip inside the
      // cascader's arrow model now, so Down means "next command" everywhere
      // in it, and one row claiming Down for a different job would make the
      // strip stutter exactly where the flyout row sits.
      //
      // Resolved through the same three-source resolver the level keys use,
      // per keydown, never `useDirection()` alone: with no `DirectionProvider`
      // mounted the provider answers "ltr" even under a real `dir="rtl"`, and
      // the flyout mirroring on a different answer than the list left the two
      // pointing opposite ways in the same panel.
      const openKey = isCascaderRtl(event.currentTarget, direction)
        ? "ArrowLeft"
        : "ArrowRight"

      // Enter and Space open through the button's own click, so they are only
      // FLAGGED here - preventing them would break the native activation.
      if (event.key === "Enter" || event.key === " ") {
        keyboardRef.current = true
        return
      }

      if (event.key !== openKey) return

      event.preventDefault()
      keyboardRef.current = true
      setOpen(true)
    },
    [disabled, onKeyDown, direction, setOpen, keyboardRef]
  )

  return (
    <PopoverPrimitive.Trigger
      ref={rowRef}
      id={triggerId}
      data-slot="cascader-submenu-trigger"
      aria-haspopup="menu"
      // NOT `disabled={disabled}`. See the note on this component: Base UI
      // would turn it into the native attribute and take the row out of the
      // panel's Tab ring.
      {...(disabled ? { "aria-disabled": true, "data-disabled": "" } : null)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        CASCADER_ACTION_CLASS,
        // The parent row stays painted while its flyout is open - the shadcn
        // submenu convention (`data-[state=open]:bg-accent` on a SubTrigger),
        // and the thing that ties the floating panel to the row it came from
        // once focus has moved inside it. Keyed off `aria-expanded`, which
        // the popover trigger carries in both states.
        "aria-expanded:bg-accent aria-expanded:text-accent-foreground",
        className
      )}
      {...props}
    >
      {icon ? (
        <span
          data-slot="cascader-action-icon"
          className="text-muted-foreground flex shrink-0 items-center justify-center"
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-start">{children}</span>
      {/* `aria-expanded` is on the trigger already, but nothing says the row
          opens a MENU rather than another level of the data tree. */}
      <span className="sr-only">, {labels.submenuAffordance}</span>
      <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2}
        aria-hidden="true"
        // Static, and `open` is deliberately not read here. A rotating chevron
        // is the DISCLOSURE convention: it means "this row's content unfolds
        // below me", and it turns to point at where that content appeared. This
        // one opens a panel to the SIDE and keeps pointing at it the whole
        // time, so turning it down would aim it at nothing.
        className="text-muted-foreground -me-0.5 size-4 shrink-0 rtl:-scale-x-100"
      />
    </PopoverPrimitive.Trigger>
  )
}

export interface CascaderSubmenuContentProps
  extends
    PopoverPrimitive.Popup.Props,
    Pick<
      PopoverPrimitive.Positioner.Props,
      "side" | "align" | "sideOffset" | "alignOffset"
    > {}

/**
 * Base UI extends the popup's keyboard event with its own handler-veto hook,
 * so the forwarded `onKeyDown` cannot be called with a plain React event.
 * Derived from the prop rather than restated, so a Base UI bump cannot make
 * the two drift.
 */
type CascaderSubmenuKeyEvent = Parameters<
  NonNullable<PopoverPrimitive.Popup.Props["onKeyDown"]>
>[0]

/**
 * The flyout itself.
 *
 * `Portal` with NO `container`: Base UI resolves a nested portal to the parent
 * portal node, which is the whole mechanism this component rests on. See the
 * file header.
 */
function CascaderSubmenuContent({
  className,
  children,
  onKeyDown,
  side = "inline-end",
  align = "end",
  sideOffset = 8,
  alignOffset = 0,
  ...props
}: CascaderSubmenuContentProps) {
  const { rowRef, close, triggerId, keyboardRef } = useCascaderSubmenu()
  const direction = useDirection()
  const popupRef = React.useRef<HTMLDivElement | null>(null)
  const typeaheadRef = React.useRef({ buffer: "", at: 0 })

  /**
   * Where focus goes when the flyout opens.
   *
   * Keyboard opens land on the first entry, which is the whole point of a menu.
   * Pointer opens must not, or every mouse click paints a focus ring on a
   * command nobody asked for - so they fall through to Base UI's own default,
   * the popup itself, which still gives Escape and the arrow keys somewhere to
   * be heard.
   *
   * `initialFocus` rather than an effect of our own: Base UI runs its focus
   * manager on open, so anything scheduled alongside it is a race the primitive
   * wins. Its `openType` argument is deliberately ignored - see `keyboardRef`,
   * which carries the classification this component actually has.
   */
  const initialFocus = React.useCallback(() => {
    const byKeyboard = keyboardRef.current
    keyboardRef.current = false
    if (!byKeyboard) return true
    return menuItems(popupRef.current)[0] ?? true
  }, [keyboardRef])

  /** Escape and the closing arrow both hand the row back what it lent out. */
  const closeAndReturn = React.useCallback(() => {
    close()
    rowRef.current?.focus()
  }, [close, rowRef])

  const handleKeyDown = React.useCallback(
    (event: CascaderSubmenuKeyEvent) => {
      onKeyDown?.(event)
      // The flyout is a DOM sibling of the combobox popup but a REACT
      // descendant of it, so every key pressed in here bubbles into the
      // combobox's handlers unless it is stopped. Enter is the dangerous one:
      // `Combobox.List` would click the highlighted row.
      event.stopPropagation()
      if (event.defaultPrevented) return

      const popup = popupRef.current
      const items = menuItems(popup)
      if (items.length === 0) return

      const active = document.activeElement as HTMLElement | null
      const index = active ? items.indexOf(active) : -1
      const move = (next: number) => {
        event.preventDefault()
        // Wraps at both ends. A command list is a ring, not a scale, and the
        // alternative is a user pressing Down against a dead stop.
        items[(next + items.length) % items.length]?.focus()
      }

      // Same three-source resolution as the trigger's open key, per keydown:
      // the close key must mirror on the SAME answer the open key did, or a
      // plain `dir="rtl"` app opens with one arrow and closes with the other.
      const closeKey = isCascaderRtl(event.currentTarget, direction)
        ? "ArrowRight"
        : "ArrowLeft"

      switch (event.key) {
        case "ArrowDown":
          return move(index + 1)
        case "ArrowUp":
          // From the popup itself (a pointer open) Up means the LAST entry, so
          // one press reaches the bottom of the list the way it does in a menu.
          return move(index === -1 ? items.length - 1 : index - 1)
        case "Home":
          return move(0)
        case "End":
          return move(items.length - 1)
        // The key pointing back at the trigger closes, mirroring the key that
        // opened the flyout, and flipping with the writing direction.
        case closeKey:
          event.preventDefault()
          return closeAndReturn()
        case "Tab":
          // A menu never holds Tab. It closes and lets focus carry on from the
          // row that owns it, which is where the user's place in the panel is.
          close()
          rowRef.current?.focus()
          return
        default:
          break
      }

      // Typeahead. One printable character jumps to the next entry starting
      // with it; typing quickly builds a prefix. Deliberately after the switch,
      // so it can never swallow a navigation key.
      if (
        event.key.length !== 1 ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return
      const now = event.timeStamp
      const state = typeaheadRef.current
      state.buffer = now - state.at > 500 ? event.key : state.buffer + event.key
      state.at = now
      const prefix = state.buffer.toLowerCase()
      const from = index === -1 ? 0 : index
      // Search starts AFTER the current entry so repeating one letter cycles
      // through the entries that share it rather than sticking on the first.
      const ordered = [
        ...items.slice(state.buffer.length > 1 ? from : from + 1),
        ...items.slice(0, state.buffer.length > 1 ? from : from + 1),
      ]
      const hit = ordered.find((item) =>
        (item.textContent ?? "").trim().toLowerCase().startsWith(prefix)
      )
      if (hit) {
        event.preventDefault()
        hit.focus()
      }
    },
    [onKeyDown, direction, close, closeAndReturn, rowRef]
  )

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        // Anchored to the footer ROW, not to whatever Base UI last treated as
        // the trigger, so the flyout tracks the row it belongs to.
        anchor={rowRef}
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          ref={popupRef}
          initialFocus={initialFocus}
          data-slot="cascader-submenu-content"
          // A list of commands with roving focus, named by the row that opens
          // it. `tabIndex={-1}` so a pointer open can park focus here without
          // adding a stop to the document's Tab ring.
          role="menu"
          aria-orientation="vertical"
          aria-labelledby={triggerId}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className={cn(
            "cn-combobox-content cn-menu-target cn-menu-translucent flex max-w-(--available-width) min-w-48 flex-col gap-0.5 outline-hidden",
            // Same padding as the list and the footer, for the same reason:
            // the flyout's rows are the footer's rows, so they have to sit the
            // same distance from their panel's edge.
            CASCADER_LIST_PAD_CLASS,
            "p-(--cascader-list-pad,4px)",
            className
          )}
          {...props}
        >
          <CascaderMenuContext.Provider value={true}>
            {children}
          </CascaderMenuContext.Provider>
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

/**
 * Whether the footer would render anything.
 *
 * For a consumer laying a panel out by hand: `CascaderFooter` already returns
 * null when there is nothing to draw, but a wrapper around it (a separator, a
 * grid row) has to make the same decision one level up.
 */
export function useCascaderHasActions(): boolean {
  const { actions } = useCascaderActions()
  return actions.length > 0
}

export {
  CascaderAction,
  CascaderFooter,
  CascaderSubmenu,
  CascaderSubmenuContent,
  CascaderSubmenuTrigger,
}
