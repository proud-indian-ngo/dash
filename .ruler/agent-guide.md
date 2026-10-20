# pi-dash agent guide

The Proud Indian volunteer and admin dashboard: a Bun and Turborepo monorepo with a TanStack Start web app on PostgreSQL, Drizzle and Rocicorp Zero. [README.md](README.md) covers what it does; [project-structure.md](project-structure.md) is the repository map.

This file is the source for the generated `AGENTS.md` and `CLAUDE.md`. Edit `.ruler/agent-guide.md`, then run `bun run ruler:apply`.

## Commands

```bash
bun install && cp .env.sample .env   # first run
bun run db:start                     # Dockerized PostgreSQL, needed by the app and Zero
bun run dev                          # web on :3001, Zero on :4848
```

| Changed | Run |
|---|---|
| TypeScript | `bun run check:types` |
| Lint, formatting or docs | `bun run check` (`bun run fix` to apply) |
| Logic with unit tests | `bun run test:unit` |
| Exports or dependencies between workspaces | `bun run check:unused` |
| Drizzle schema | `bun run db:generate`, read the generated migration, then `bun run db:migrate` |
| Drizzle schema the client syncs | also `bun run zero:generate` |
| A user flow | `cd packages/e2e && bash run-e2e.sh tests/<spec>.spec.ts`; the full suite is `bun run test:e2e` |
| This guide | `bun run ruler:apply` |

Worktrees: `bun run worktree:setup <ID>` (add `--isolated-db` for separate PostgreSQL state), `bun run worktree:teardown`.

## Done when

- The focused checks for what changed pass, or you report why one could not run.
- A new route, CRUD flow or role-gated capability has an E2E spec.
- The owning doc records any new rule, decision or gotcha (see [Documentation](#documentation)).
- The diff holds no edits to generated files.

## Boundaries

**Always**
- Change generated files through their source:
  - `routeTree.gen.ts` from route files
  - `packages/zero/src/schema.ts` from the Drizzle schema (`zero:generate`)
  - `packages/db/src/migrations/**` from the Drizzle schema (`db:generate`)
- Keep secret values in `.env`. `.env.sample` holds names and sample values.
- In user-facing text, call the organisation "Proud Indian" and the app "the dashboard".
- Add design-system components with `bun run ui:add <component>`. Edits under `packages/design-system/components/**` stay class-level (shadcn `base-nova`); behaviour goes in wrappers under `apps/web/src/components/shared`.
- A new `packages/*` workspace goes into the Dockerfile copy layer before `bun install`.

**Ask first**
- Anything that touches production: data, scripts, deploys.
- `bun run whatsapp:templates submit`: it sends templates to Meta for review. Submit only while no earlier template is still awaiting review.
- Adding a stored column or table where a derived value or an existing relationship would answer the ask.
- Deleting or renaming a permission ID. Its `rolePermission` rows need a migration.
- A design decision that can go more than one way: present two or three options with trade-offs and a recommendation. For a major UI or UX decision (a new screen, flow or pattern), first look for references on Mobbin when its tools are available. Skip the options when told to work autonomously; then take the recommended one and say so.

**Never**
- Hand-edit `packages/design-system/lib/utils.ts` or `packages/design-system/hooks/use-mobile.ts`.

## Read before changing

Each chapter is in `docs/architecture/` and holds the rules for its area. Read it before you change that area. Skip chapters for copy, lint, dependency bumps and isolated tests.

| Before you touch | Read |
|---|---|
| Permissions, roles, route guards, server-function checks | `authorization.md` |
| A `POST` server function or API route, or anything that writes | `audit-log.md`: every one is audited or listed as exempt |
| Side effects: notifications, email, WhatsApp, background work | `jobs.md`, then `notifications.md` |
| Zero queries, relationships, route preloads, SQL or indexes | `.agents/skills/query-performance/SKILL.md`, then `data-layer.md` |
| Drizzle schema or a new table | `data-layer.md` (IDs, private schema, money, seeds) |
| Imports in server code, design-system or shared imports | `project-structure.md#imports` |
| Screens, styling, pages, sheets, menus | `design-language.md` |
| Sign-in, sessions, sign-up links, user admin, roles settings | `auth.md` |
| Teams, events, attendance, updates, photos, feedback, interest, orientation, the home dashboard, Analytics, Scheduled messages, WhatsApp groups | `teams-and-events.md` |
| Recurring events or the public events feed | `recurring-events.md` |
| Finance overview: programmes, projects, funds, account heads, Charged to, claim for others, budgets | `finance-and-programmes.md` |
| Donors, contributions, imports, Razorpay, give.do payouts | `finance-income.md` |
| Bank statements, credit and debit matching | `finance-bank-statements.md` |
| Books, posting rules, opening balances, year close, audited figures, CA workbook | `finance-books.md`; figures and CA rules in `finance-ledger-cutover.md` |
| Donation receipts, donations return (Form 113/114) | `finance-receipts-and-returns.md` |
| Reimbursements: lifecycle, payouts by bank or UPI, claim for others, advance payments, financial-year export | `reimbursements.md` |
| Vendors and vendor payments | `vendor-payments.md` |
| Cash vouchers, payee signatures, PDFs | `cash-vouchers.md`, `pdf.md` |
| Kalakriti | `kalakriti-registration.md`; terms in `CONTEXT.md` |
| Social API and Social page | `social-api.md` |
| Uploads, attachments, Immich | `file-uploads.md` |
| Logging and error handling | `observability.md` |
| Caches and rate limits | `caching.md` |
| Environment variables | `env-and-secrets.md`; the full list is in `DEPLOYMENT.md` |
| Workspaces, Turborepo, Docker | `monorepo.md` |
| E2E specs | `e2e-testing.md` |
| Governance: trustee register, deed versions, vault, signing service | `governance.md` |
| Circular resolutions, DSC signing helper, long-term copies | `governance-resolutions.md` |
| Compliance calendar | `governance-compliance.md` |
| Board meetings and minutes | `governance-meetings.md` |
| Plate editor, shared constants | `editor.md`, `shared.md` |

## Documentation

Docs hold what the code can't tell a reader: why it is built this way, rules that span several files, gotchas, decisions and rejected alternatives, procedures, external contracts, and facts that would take many files to gather. Before writing a line, ask whether a file or two of code would teach the same thing; if so, leave it out. Docs describe the system as it is now; git history holds how it got here.

- **Update in place.** When behaviour changes, rewrite the section that describes it and delete what is no longer true. Avoid appending notes after the old text.
- **One fact, one home.** Each rule lives in its owning chapter. Elsewhere, link to it.
  - The README gets one line per feature area.
  - This guide gets one routing row per area.
- **Leave out** changelogs, "shipped" status, PR and migration numbers, dated narrative, and restatements of code or config: file, route, field and script lists, UI copy, and step-by-step narration of one function.
- **Budgets:** every doc has a word budget, enforced by `bun run check:docs` (`scripts/check-doc-budgets.ts`, also part of `bun run check` and the commit hook). When a doc is over, cut it or split it by subsystem. Raise a budget only when the doc cannot be split.
- **New rules go in the owning chapter.** A rule earns a place here only if it applies across the repository and no tool can enforce it. Otherwise prefer a lint rule, test or hook.
- **Major features:** one README line, the owning chapter, a routing row here if it opens a new area, `project-structure.md` for a new structural pattern, and `DEPLOYMENT.md` for production env vars, services or build steps.
