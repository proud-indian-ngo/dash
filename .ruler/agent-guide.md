# pi-dash repository instructions

pi-dash is a TypeScript monorepo for a volunteer and admin management dashboard. The web app uses TanStack Start, PostgreSQL, Drizzle, and Rocicorp Zero for real-time data; repository packages own authentication, environment validation, jobs, notifications, email, WhatsApp, observability, design system components, and Playwright E2E tests.

This file is the source for generated `AGENTS.md` and `CLAUDE.md`. Apply changes with `bun run ruler:apply`; do not edit generated copies directly.

## Architecture and entry points

| Area | Owns | Entry points |
|---|---|---|
| Web app | Routes, server functions, UI, hooks, middleware | `apps/web/src/router.tsx`, `apps/web/src/routes/`, `apps/web/src/functions/` |
| Database | Drizzle schema, migrations, PostgreSQL and local services | `packages/db/src/schema/`, `packages/db/docker-compose.yml` |
| Zero | Synced schema, queries, mutators | `packages/zero/` |
| Auth and permissions | Better Auth configuration and permission resolution | `packages/auth/`, `packages/db/src/permissions.ts` |
| Jobs and notifications | pg-boss handlers and multi-channel delivery | `packages/jobs/`, `packages/notifications/` |
| Environment | Server and web environment contracts | `packages/env/`, `.env.sample` |
| Design system | Shared shadcn/ui and reui components | `packages/design-system/` |
| E2E | Playwright fixtures, seeds, specs, and orchestration | `packages/e2e/` |

## Setup and focused verification

```bash
bun install
cp .env.sample .env
bun run db:start
bun run zero:generate
bun run dev
```

The local app and Zero require Dockerized PostgreSQL. Core local variables are `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ZERO_UPSTREAM_DB`, `ZERO_MUTATE_URL`, `ZERO_QUERY_URL`, and `VITE_ZERO_URL`. Keep secret values in `.env`; only names and sample values belong in `.env.sample`.

| Changed surface | Focused checks |
|---|---|
| TypeScript in any package | `bun run check:types` |
| Lint or formatting | `bun run check` |
| Unit-testable behavior | `bun run test:unit` |
| Workspace exports or dependency graph | `bun run check:unused` |
| Drizzle schema | `bun run db:generate`; inspect the generated migration; run `bun run db:migrate` when local application is needed |
| Zero schema source | `bun run zero:generate` |
| `packages/e2e/**` or major user flow | `bun run test:e2e`; use `bun run test:e2e:ui` for local debugging |
| One E2E spec | `cd packages/e2e && bash run-e2e.sh tests/<spec>.spec.ts` |
| Generated agent instructions | `bun run ruler:apply` |

Treat this table as the canonical command map for task planning. Do not reopen root or package manifests, `.env.sample`, or generated instructions solely to confirm facts listed here; inspect them only when modifying their contents or when task-specific detail is missing.

There is no single documented full-repository gate. **Done when** the task goal is met, changed files are listed, relevant checks passed or have a concrete unavailable reason, there are no generated-file edits, stale references, or unexplained diffs, and major features have E2E coverage.

Lefthook runs type checking, lint, unit tests, and unused-export checks in parallel before commits. Commitlint enforces conventional commits.

## Generated and protected files

- Edit `.ruler/agent-guide.md`, then run `bun run ruler:apply`; do not edit `AGENTS.md` or `CLAUDE.md` directly.
- Do not edit `routeTree.gen.ts`, `packages/zero/src/schema.ts`, `packages/db/src/migrations/**`, `packages/design-system/components/**`, `packages/design-system/lib/utils.ts`, or `packages/design-system/hooks/use-mobile.ts` directly.
- Change route sources to regenerate the route tree. Change the Drizzle schema, then run `bun run zero:generate` for the Zero schema.
- Add new design-system components with `bun run ui:add <component>`.
- When adding a new `packages/*` workspace, add its package manifest to the Dockerfile copy layer before `bun install`.

## Direct architecture routing

Read the named chapter directly when its detailed behavior is needed; do not read `docs/architecture/index.md` first. For ownership, entry points, commands, and protected paths already stated here, use this file without reopening the chapter or project map.

| Task touches | Read |
|---|---|
| Zero, Drizzle, sync, SSR loaders, optimistic updates | `docs/architecture/data-layer.md` |
| Better Auth, sessions, sign-in | `docs/architecture/auth.md` |
| Permissions, roles, authorization checks | `docs/architecture/authorization.md` |
| Recurring events and RRULE | `docs/architecture/recurring-events.md` |
| Vendor payments and invoice approval | `docs/architecture/vendor-payments.md` |
| pg-boss, notifications, WhatsApp delivery | `docs/architecture/notifications.md`, `docs/architecture/jobs.md` |
| R2 uploads, attachments, Immich | `docs/architecture/file-uploads.md` |
| Cash-voucher PDF generation | `docs/architecture/cash-vouchers.md`, `docs/architecture/pdf.md` |
| Logging and request/task events | `docs/architecture/observability.md` |
| Plate editor | `docs/architecture/editor.md` |
| Shared client/server constants | `docs/architecture/shared.md` |
| Workspaces, Turborepo, Docker package layout | `docs/architecture/monorepo.md` |
| Environment, secrets, worktree ports | `docs/architecture/env-and-secrets.md` |
| Auth cache, permission cache, rate limiting | `docs/architecture/caching.md` |
| Playwright, seeds, auth state, E2E isolation | `docs/architecture/e2e-testing.md` |
| Kalakriti Edition access, registration, lifecycle, schedule, audit, or exports | `docs/architecture/kalakriti-registration.md` |

Skip architecture docs for copy, CSS, component restyling, lint-only changes, dependency bumps, isolated tests, typo fixes, and unrelated dev-tool configuration. Start from the owning code and open a chapter only when the code exposes an unfamiliar boundary.

## Load-bearing implementation rules

### Permissions

- Use `assertHasPermission(ctx, "permission.id")` for authorization, `can(ctx, "id")` for conditional server checks, and `hasPermission("id")` from AppContext on the client.
- For protected TanStack routes, enforce the permission in `beforeLoad` with `assertPermission(context, "permission.id")` and gate the matching UI action with `hasPermission`. Test `Route.options.beforeLoad` directly with denied and allowed contexts; do not extract a wrapper solely to make the guard testable.
- Add permissions in `packages/db/src/permissions.ts`. Do not delete or rename IDs without migrating `rolePermission` rows.
- Separate `{entity}.view` from `{entity}.manage` when admin pages expose sensitive data.

### Jobs and mutations

- Use `enqueue()` from `@pi-dash/jobs` for asynchronous side effects. Do not call notification or WhatsApp handlers directly from server functions, auth hooks, or mutators; `notifyUserDeleted` is the synchronous pre-deletion exception.
- Wrap side-effect enqueues with `withFireAndForgetLog()`. Await enqueue only when enqueueing is the primary operation.
- Use `handleMutationResult()` for Zero mutation server results.
- Use `uuidv7()` for IDs. Do not use `Date.now()` in notification idempotency keys; pass the deterministic mutator timestamp.

### Imports and React boundaries

- Import design-system components through `@pi-dash/design-system/components/ui/...` or `/reui/...`, never through `src/` paths.
- Put client-accessible constants in `@pi-dash/shared`.
- Keep static imports in server functions, API routes, and server-only packages. Do not use dynamic imports in `createServerFn` or `routes/api/`.
- Keep `useMemo` and `useCallback` where third-party components or shared hook return values require stable references.

## Documentation and delivery

- Update `README.md` and this source guide for major features.
- Update `project-structure.md` when routes, environment variables, paths, or structural patterns change.
- Update the matching architecture chapter when a subsystem boundary changes.
- Update `DEPLOYMENT.md` when production environment variables, services, or build steps change.
- New database tables require idempotent seed records in `scripts/seed.ts`.

For worktrees, use `bun run worktree:setup <ID>` and `bun run worktree:teardown`; use `--isolated-db` when the task needs isolated PostgreSQL state.
