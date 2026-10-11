# Design language

pi-dash uses the **product** design language of `@proudindian/design` (pi-design), not the playful **brand** language of the website, marketing and print. The two share the logo, the sky colour and the fonts, and almost nothing else. When a request mentions "the brand", "the website look" or "Proud Indian style" for a dashboard screen, apply the product language below.

## Sources of truth

| What | Where |
|---|---|
| Product rules (colour, type, shape, density, components, tables) | pi-design brand guide, appendices A1 and A2 (`brand/Proud-Indian-Brand-Guidelines.pdf`, pages 29–31) |
| Which language a surface uses, and what never crosses over | pi-design `AGENTS.md` |
| Token mapping into shadcn | `packages/design-system/styles.css` (`:root`, `.dark`, `@theme inline`) |
| Status and Tag | `apps/web/src/components/shared/status-badge.tsx` |
| Tables | `apps/web/src/components/data-table/data-table-wrapper.tsx`, `.agents/skills/create-data-table/SKILL.md` |

## Never in pi-dash

These belong to the brand language only:

- the `.pi-*` CSS classes (`pi-btn`, `pi-chip`, `pi-card`, `pi-sticker`, …), the `@proudindian/design` React components and `PiRoot`;
- the `@proudindian/design/css`, `/primitives.css`, `/styles.css` and `/shadcn.css` imports (pi-dash imports only `theme.css` and `fonts.css`);
- doodles and illustrations, polaroids, tape and tickets;
- paper backgrounds (`bg-paper`, `bg-surface-paper`), ink offset shadows (`shadow-ink`), pill and 14–26px radii (`rounded-pill`, `rounded-14`);
- Bricolage Grotesque at weight 800, and display type for anything except page titles, big numbers and dates;
- marigold or the Donate colour, which is never a status.

## Use instead

- **Colour.** Use the shadcn utilities (`bg-background`, `bg-card`, `text-muted-foreground`, `border`, `bg-primary`). They already point at the product tokens: white and ink-tinted greys in light mode, neutral charcoal in dark mode. Don't hard-code hex values or reach for brand utilities such as `bg-sky` or `text-ink`.
- **State.** The active nav item, tab or toggle is sky ink on sky wash (`bg-sidebar-accent text-sidebar-accent-foreground`). One primary button per screen.
- **Type.** Geist (`font-sans`) for everything people read, at 13px (`text-sm`). Page titles, big numbers and dates use `font-display font-semibold` (Bricolage 600). Amounts, dates, counts, IDs and emails in tables use Paper Mono (`font-mono`), which column `meta.kind` applies automatically.
- **Status and categories.** `StatusBadge` (soft tint, dot and word, five tones) for anything that can change; `Tag` (grey outline) for fixed labels. Colour never carries meaning alone.
- **Shape and density.** Theme radii only (`rounded-md`, `rounded-lg`, `rounded-xl`: about 6, 7 and 10px; `StatusBadge` and `Tag` use 5px), hairline borders, no offset shadows. 32px buttons; 36px inputs, selects and date pickers (40px on touch screens), except the 32px table toolbar search; 36px one-line table rows.
- **Page headers.** Every app page starts with `PageHeader` from `@/components/shared/page-header`: the title, with a `StatusBadge` or `Tag` beside it, then an optional muted line under it. List and form pages use a one-sentence `description` of what the page is for; detail pages use `meta`, short facts such as team, date, requester or city, joined with dots. Actions go on the right: at most one primary button (a list's "Add …" lives here, not in the table toolbar), one or two outline buttons, and everything else in `PageHeaderMenu`, with destructive actions last. On phones the actions wrap under the title.
- **Sidebar.** The header is the official compact lockup (`@proudindian/design/logo/svg/pi-lockup-compact.svg`, the `-reversed` file in dark mode), linking home, and the symbol alone when collapsed. Rows are 28px (36px on touch screens); hover is a neutral grey and the active item is the one sky ink-on-wash state. Hairlines separate groups in the collapsed rail. Unread notifications show as a dot on the bell beside the account, not on the avatar.
- **Menus.** Row and page menus go through `ResponsiveActionMenu`, which requires an icon on every item (a Hugeicons icon, drawn muted) and always puts destructive items last, in red, after a divider. Desktop menus are a solid popover panel with 28px rows (taller on touch screens); phones get the bottom drawer.
- **Detail sheets.** Every detail sheet starts with `DetailSheetHeader` from `@/components/shared/detail-sheet-header`, which follows the page header's rules: title (with an avatar when there is one), status badge and short facts, then one or two outline buttons and a `PageHeaderMenu`. Sheet actions match the row menu for the same record, so nothing needs the sheet closed first. Actions don't sit at the bottom of the sheet; section-level actions (such as "Add role") stay with their section.
- **Patterns.** `DataTableWrapper` for tables, `Sheet` from `@/components/shared/responsive-sheet` for detail views, `ResponsiveActionMenu` for row actions, `deferAction` from `@/lib/deferred-actions` for one-click actions that can be undone, and a confirmation dialog for deletes.
- **Dialogs.** Three widths: `sm:max-w-(--dialog-sm)` (400px) for confirms and one-field prompts, `--dialog-md` (480px) for most forms, `--dialog-lg` (640px) for long or two-column forms; very wide pickers and tables keep their own width. Desktop dialogs are banded: the header sticks above a hairline, the fields scroll, and the footer (a `DialogFooter`, or a form's `FormActions`, styled in `apps/web/src/index.css`) sticks on a grey strip with Cancel then the verb on the right. Page-like dialogs opt out with `data-plain`. Confirm buttons name the thing ("Delete team", not "Delete" or "OK"). Phones keep the bottom drawer.
- **Logo.** Use the files from `@proudindian/design/logo/` as appendix A1 describes; never redraw or restyle it.

## Changing the language

Product tokens and rules change in pi-design first (tokens and appendices A1–A2), then pi-dash moves to the new tag and maps the tokens in `packages/design-system/styles.css`. Keep `packages/design-system/components/**` edits to class-level styling that matches the shadcn `base-nova` style.
