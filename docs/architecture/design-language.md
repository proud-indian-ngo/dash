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
- **Shape and density.** Theme radii only (`rounded-md`, `rounded-lg`, `rounded-xl`: about 6, 7 and 10px; `StatusBadge` and `Tag` use 5px), hairline borders, no offset shadows. 32px buttons and fields, 36px one-line table rows.
- **Patterns.** `DataTableWrapper` for tables, `Sheet` from `@/components/shared/responsive-sheet` for detail views, `ResponsiveActionMenu` for row actions, `deferAction` from `@/lib/deferred-actions` for one-click actions that can be undone, and a confirmation dialog for deletes.
- **Logo.** Use the files from `@proudindian/design/logo/` as appendix A1 describes; never redraw or restyle it.

## Changing the language

Product tokens and rules change in pi-design first (tokens and appendices A1–A2), then pi-dash moves to the new tag and maps the tokens in `packages/design-system/styles.css`. Keep `packages/design-system/components/**` edits to class-level styling that matches the shadcn `base-nova` style.
