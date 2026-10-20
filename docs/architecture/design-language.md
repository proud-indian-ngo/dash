# Design language

The dashboard uses the **product** language of `@proudindian/design` (pi-design), never the playful **brand** language of the website and print. They share only the logo, sky colour and fonts. "The brand" or "Proud Indian style" for a dashboard screen means the product language.

## Sources of truth

| What | Where |
|---|---|
| Product rules (colour, type, shape, density, components, tables) | pi-design brand guide appendices A1–A2 (`brand/Proud-Indian-Brand-Guidelines.pdf`, pages 29–31) |
| Which language a surface uses | pi-design `AGENTS.md` |
| Token mapping into shadcn | `packages/design-system/styles.css` (`:root`, `.dark`, `@theme inline`) |
| Status and Tag | `apps/web/src/components/shared/status-badge.tsx` |
| Tables | `apps/web/src/components/data-table/data-table-wrapper.tsx`, `.agents/skills/create-data-table/SKILL.md` |

Token and rule changes start in pi-design; the dashboard then bumps the tag and maps tokens in `styles.css`. Edits under `packages/design-system/components/**` stay class-level, matching shadcn `base-nova`.

## Never in the dashboard

- `.pi-*` classes (`pi-btn`, `pi-chip`, `pi-card`, `pi-sticker`, …), `@proudindian/design` React components, `PiRoot`.
- Imports of `@proudindian/design/css`, `/primitives.css`, `/styles.css` or `/shadcn.css`. Import only `theme.css` and `fonts.css`.
- Doodles, illustrations, polaroids, tape, tickets.
- Paper backgrounds (`bg-paper`, `bg-surface-paper`), ink offset shadows (`shadow-ink`), pill and 14–26px radii (`rounded-pill`, `rounded-14`).
- Bricolage Grotesque at 800; display type for anything except page titles, big numbers and dates.
- Marigold or the Donate colour. It is never a status.
- Hard-coded hex, brand utilities (`bg-sky`, `text-ink`) and Tailwind palette colours (`text-green-600`, `bg-amber-50`).
- Redrawn or restyled logos. Use the files in `@proudindian/design/logo/` as appendix A1 describes.

## Tokens

- Colour: shadcn utilities (`bg-background`, `bg-card`, `text-muted-foreground`, `border`, `bg-primary`). They carry dark-mode values, so no `dark:` colour pairs.
- Status colour:
  - positive text and icons: `text-success-foreground`;
  - dots and bars: `bg-success`;
  - negative: `text-destructive`;
  - warning notice: `border-warning/30 bg-warning/10 text-warning-foreground` (`dark:bg-warning-foreground/10`).
- Charts: `--chart-*` tokens.
- Active nav item, tab or toggle: sky ink on sky wash (`bg-sidebar-accent text-sidebar-accent-foreground`). This is the only active state.
- Type: Geist (`font-sans`) at 13px (`text-sm`) for reading text. Page titles, big numbers and dates use `font-display font-semibold` (Bricolage 600). Amounts, dates, counts, IDs and emails in tables use Paper Mono (`font-mono`), applied by column `meta.kind`.
- Table header icons: a column that means a domain concept (Programme, Center, Vendor) sets `meta.icon` from `COLUMN_ICONS`, so the concept looks the same in every table. Other columns get their `meta.kind` icon.
- Radii: theme only (`rounded-md`, `rounded-lg`, `rounded-xl`). `StatusBadge` and `Tag` use 5px. Hairline borders, no offset shadows.
- Sizes: buttons 32px. Inputs, selects and date pickers 36px, except the 32px table toolbar search. One-line table rows 36px.
- Touch (`pointer-coarse:`) raises controls to at least 36px: buttons, icon buttons, inputs and tab lists 40px, small buttons 36px, calendar days 40px. Size touch targets this way, not with phone breakpoints, so tablets get them too.
- Sideways scrollers (tab lists, view tabs) hide their scrollbar and use `scroll-fade-x`, which fades an edge only while there is more to scroll.

## Status and labels

- `StatusBadge` (soft tint, dot and word, five tones) for anything that can change. `Tag` (grey outline) for fixed labels.
- Colour never carries meaning alone.

## Copy

- Sentence case for actions ("Add member"), action dialog and page titles ("New reimbursement"), form and detail labels ("Expense date"), and status badges ("Interest pending").
- Names of things keep their case: sidebar items, column headers, page names ("Vendor Payments", "Created By"), and Kalakriti domain nouns (Edition, Competition, Category, Session, Division, Entry, Venue, Center, Student, Guardian, Liaison, Judge), so "Add Venue" and "Age Category".
- Submit and confirm buttons name the thing ("Submit reimbursement", "Save changes", "Delete team"), never a bare "Submit", "Save", "Create", "Delete" or "OK".
- The sign-in verb is "Log in".

## Dates

Use the formats in `apps/web/src/lib/date-formats.ts`, which match `en-IN` `Intl` output.

- Lists show minutes. Only audit and job detail sheets show seconds (`formatTimestamp(value, { seconds: true })`).
- `ISO_DATE` only for keys, URLs and input values.
- No ad-hoc format strings or bare `toLocaleString()`.
- Immich album names keep their original format so existing albums still match.

## Layout and navigation

### Page headers

Every app page starts with `PageHeader` (`@/components/shared/page-header`):

- Title, with a `StatusBadge` or `Tag` beside it, then an optional muted line.
- List and form pages: a one-sentence `description` of the page's purpose. Detail pages: `meta`, short facts (team, date, requester, city) joined with dots.
- Actions on the right: at most one primary button (a list's "Add …" lives here, not in the table toolbar), one or two outline buttons, everything else in `PageHeaderMenu` with destructive actions last. On phones actions wrap under the title.

`KalakritiPageHeader` builds on `PageHeader`: a muted kicker ("Kalakriti · 2026", never spaced capitals), title, one-line `meta`, actions. Kalakriti page counts use `SummaryMetricCards`: a chip with `onClick` filters the table, and gap counts (labels with "without", "unassigned", "below minimum", "out of stock" or "gaps") tint warning when non-zero. Section headings above the chips are screen-reader only.

### Sidebar

- Header: the compact lockup (`@proudindian/design/logo/svg/pi-lockup-compact.svg`, `-reversed` in dark mode) linking home; the symbol alone when collapsed.
- Rows 28px (36px on touch). Hover is neutral grey; active is the sky ink-on-wash state. Hairlines separate groups in the collapsed rail.
- Phones have no sidebar toggle. The top bar shows the compact lockup, and `MobileTabBar` holds up to four destinations from the person's nav (Home, Events, Claims, Teams; in Kalakriti Overview, Students, Competitions, plus Scan for event-day roles) and Menu, which opens the sidebar as a drawer that closes on navigation. Form and import pages (`/new`, `/import`) and records in edit mode (`?mode=edit`) hide the bar so their actions own the bottom edge. Anything fixed to the bottom on phones, toasts included, sits above `--mobile-tab-bar-height`.
- Notifications have one entry point, `NotificationBell`: beside the account on desktop (inbox in a popover), in the top bar on phones (bottom drawer). Unread shows as a dot on the bell, not the avatar. The account menu does not list notifications.
- Notification titles keep a leading emoji for WhatsApp and email; the inbox strips it with `stripLeadingEmoji`.

### Settings

- One page at `/settings/*`, opened from the account menu, and from **Settings** at the end of the sidebar's Admin group for people who can open an Organization section (it stays active anywhere under `/settings`).
- Nav grouped into **You** and **Organization** (a select on phones). Sections are listed once in `apps/web/src/lib/settings-sections.ts`, which feeds the nav, breadcrumbs and each section's `PageHeader`.
- Settings are `SettingsRow`s in a `SettingsCard` (label left, control right). A row holding a switch or checkbox is `inline`: the whole row is its label and the control stays beside the text on phones. Lists are `SettingsListItem`s in one framed card with an outline "Add …" button above, row actions in a `ResponsiveActionMenu`. Channel preferences are a checkbox grid with labelled columns; phones show labelled checkboxes under each topic.
- A long form ends in `SaveBar`, which pins above the phone tab bar with an unsaved-changes summary while the form is dirty.
- Forms are one column, `max-w-md` to `max-w-xl`.

### Detail pages

- Say each fact once. Identifying facts (team, when, where, privacy) go in the header `meta`.
- Main column: working content in tabs, the list people act on first (an event's Volunteers). Counts go in tab labels only.
- Right column: one `Details` card of label and value, omitted when empty.
- Lists inside a page: one framed list (`divide-y rounded-lg border`) of about 44px rows, not a card per row. Row actions go in a `ResponsiveActionMenu`, not text buttons.
- Build from `@/components/shared/record-detail`: `RecordDetailLayout` (main column and a 20rem right column), `RecordSection` (title with an outline action), `DetailsCard`/`DetailsRow`, `AttachmentList`, `RejectionNote`, `HistoryCard` (actions read "Invoice submitted", never the stored code).
- One filled button per page: the step that is actually waiting. An admin override of a later status is outline.

### Detail sheets

- `Sheet` from `@/components/shared/responsive-sheet`, starting with `DetailSheetHeader` (`@/components/shared/detail-sheet-header`). It follows the page-header rules: title (with avatar if any), status badge, short facts, then one or two outline buttons and a `PageHeaderMenu`.
- Sheet actions match the record's row menu. None at the sheet bottom; section actions ("Add role") stay with their section.

### Agenda lists

Time-based lists that are not tables (the events page):

- Upcoming and Past line tabs with counts; one toolbar line (search, selects, date picker).
- One framed list with a muted date band (`Fri 16 Oct`, `Today ·`, `Tomorrow ·`) over two-line rows:
  - start time over duration;
  - the name as the row link, with `Tag`s for repeat ("Weekly") and "Team only";
  - team, place (typed address, else public area and city) and a "Map" link for map URLs;
  - volunteers against target (amber when short);
  - the viewer's action as an outline button or status badge, plus an "N to review" badge for interest reviewers (sessions not yet started only).
- On phones tags move to the second line and long names and places wrap.
- Show 30 days at a time with "Show next 30 days · N events".

### Dashboard and analytics

- Dashboard counts are the list pages' stat chips, led by "Waiting for you" (warning tint when non-zero) for reviewers, else "My pending".
- "Waiting for review" shows one row per kind of work (count, ₹ to approve or event names, age of the oldest, amber after a week) linking to the filtered list or event. The chip and panel share `countPendingReviews`. Section icons stay muted.
- Analytics spending totals are stat chips; Outcomes leads with four tiles (label, big number, one muted caption) and coverage notes under them. Each panel is a `ChartCard` (sentence-case title, optional note, empty state in the same frame). Rankings use `RankedBars` (name, bar, amount, count), not bar charts with wrapped labels or donuts.
- Panel grids set `*:min-w-0` so charts cannot widen the page on phones.
- On phones stat chips are one swipeable row running to the screen edge; wider screens wrap.

## Components

- Tables: `DataTableWrapper`. Phones get cards: columns marked `compact: "primary"` stack under the first one (a count reads with its column name, "Members 4"), and the rest fold into the row. Pick the primary facts a person scans for (who, when, how much); a status badge reads on its own, so it goes in that line rather than trailing with its column name. Cells use `useCompactTable` to leave out a missing fact instead of showing a bare dash, and long titles wrap to two lines. Columns and Group by are wider-screen tools; phone view tabs skip empty statuses.
- Menus: `ResponsiveActionMenu` for row and page menus. Every item needs a Hugeicons icon (drawn muted); destructive items go last, in red, after a divider. Permission checks and confirmations stay with the caller, not inside the menu. Desktop: solid popover with 28px rows (taller on touch). Phones: bottom drawer.
- Undoable one-click actions: `deferAction` from `@/lib/deferred-actions`. Deletes: a confirmation dialog.
- Dialog widths: `sm:max-w-(--dialog-sm)` for confirms and one-field prompts, `--dialog-md` for most forms, `--dialog-lg` for long or two-column forms. Very wide pickers and tables keep their own width.
- Desktop dialogs are banded: sticky header above a hairline, scrolling fields, sticky footer (`DialogFooter` or `FormActions`, styled in `apps/web/src/index.css`) on a grey strip. Page-like dialogs opt out with `data-plain`. Phones use the bottom drawer for every dialog, confirmations included, with the same actions pinned above the home indicator and Cancel and the verb sharing the width. A tap outside a confirmation doesn't close it; swiping it down counts as Cancel. App code imports dialogs from `@/components/shared/responsive-dialog` or `responsive-alert-dialog`; lint rejects the design-system ones.
- Date, date-time and range pickers open through `ResponsivePicker` (`@/components/shared/responsive-picker`): a popover on wider screens, a bottom drawer titled with the field label and closed with Done on phones, where a popover opened mid-form lands off-screen.
- Field outlines use `--control` (checkboxes and off switches `--control-strong`). Text fields, selects, comboboxes and date pickers darken to `--control-strong` on hover unless disabled, invalid or focused. An invalid field keeps its label neutral; its red outline and the message below carry the error.
- `FormActions`: Cancel then verb, right-aligned, everywhere except scan panels, which keep the action left (away from toasts, for repeated scans).
- Loading: `DetailPageSkeleton` and `TableSkeleton` (`@/components/shared/page-skeleton`). Spinners only for actions in progress and inside dialogs.
- Empty and error states: `NotFoundState` (`@/components/shared/not-found-state`), a muted icon tile, page-title type, one sentence, at most one primary button, no illustrations.
  - Missing records: `RecordNotFound` (noun and a "Back to …" link).
  - Unknown addresses for signed-in people hit the `_app/$` route so the sidebar stays.
  - Page errors: `ErrorState`, red-tinted tile with a copyable reference (the id logged to evlog and PostHog); the raw message is folded away for admins.
  - Outside the app layout, `StandalonePage` frames the block with the compact lockup.
- Tips: `TipStrip` (`@/components/shared/tip-strip`), one dismissible sentence under the header for something people would not discover. At most one per page, optional link action, stable `id`.
- Sign-in screens: `AuthLayout` (`components/login/auth-layout.tsx`), compact lockup over the form beside a flat info-wash panel (`bg-info/10`, no illustrations or animation) with the welcome text, sign-up steps or the session being joined. Phones show the form only. Titles use page-title type.

## Motion and hover

- Overlays use the app curves (`--ease-out-expo`, `--ease-out-sheet`), never default `ease`. Menus, popovers, selects and comboboxes enter in 120ms (tooltips 100ms) and leave in 100ms; dialogs take 150ms; sheets and the sidebar 200ms.
- Route changes that change the path crossfade the root through the View Transitions API (`defaultViewTransition` in `apps/web/src/router.tsx`). Pages have no other entrance animation.
- Tooltips wait 400ms before the first opens (root `TooltipProvider`), then open instantly between triggers.
- Use Tailwind v4 `hover:` (hover-capable devices only), not raw `:hover` CSS.
- The global `prefers-reduced-motion` rule in `styles.css` turns all motion off.
