# Agent Guide (Lean)

## Session Init

Activate caveman mode (full) at session start. Run `/caveman` or say "caveman mode" before first task. Skip if already active (Claude Code hook, Codex plugin handle automatically).

## RTK — Token-Optimized Tooling

Always use `rtk` instead of raw equivalents. Hooks enforce in Claude Code; other agents follow manually.

- `rtk grep "<pattern>" [path] -t <type>` — never raw `grep`, `rg`, or built-in Grep. Flags: `-m 50`, `-l 80`, `-u`.
- `rtk ls [path]`, `rtk read <file>`, `rtk git status|diff|...` — never raw `ls`, `cat`, `git`.
- RTK output authoritative. Never re-run without RTK, discard output, or fall back to raw commands.
- Never circumvent: no `command grep`, `command rg`, `/usr/bin/grep`, or any bypass.

## Prime Directives

- Smallest correct change; every changed line traces to request.
- Verify before claiming success.
- Prefer repo source-of-truth over memory.
- Preserve existing architecture unless task asks otherwise.
- State assumptions explicitly; ask instead of guessing when ambiguous.
- Prefer simplest non-speculative solution that fully solves request.

## Response Contract

- Report findings first, then action, then blockers (if any).
- Include file paths for every code claim.

## Execution Loop

1. Clarify ambiguity, state assumptions/tradeoffs, define verification target.
2. Inspect with `rtk grep` + targeted reads.
3. Minimal plan → smallest change set → necessary checks → report delta.

## Guardrails

### Source & Generated Files
- Edit source files, not generated outputs.
- DO NOT edit `CLAUDE.md`/`AGENTS.md` directly — edit `.ruler/agent-guide.md`, then `bun run ruler:apply`.
- DO NOT edit: `routeTree.gen.ts`, `packages/zero/src/schema.ts`, `packages/db/src/migrations/**`, `packages/design-system/components/**`, `packages/design-system/lib/utils.ts`, `packages/design-system/hooks/use-mobile.ts`.
- Router tree changes: edit route source files, regenerate. Zero schema: edit Drizzle schema then `bun run zero:generate`.

### Imports & Bundling
- Design-system: `@pi-dash/design-system/components/ui/...` or `.../reui/...` — never `src/` path. New components: `bun run ui:add <component>`.
- Client-accessible constants: `@pi-dash/shared` (not `@pi-dash/db/schema/shared`).
- `React.lazy()` for heavy third-party libs not needed on initial render (Plate editor, Courier inbox, phone input).
- Static imports in server functions, API routes, server-only packages — TanStack Start/Nitro handle client exclusion.
- DO NOT use dynamic `import()` in `createServerFn`, `routes/api/`, or server-only packages. DO NOT use dynamic `import()` for `createServerFn` exports in client components — TanStack Start replaces with RPC stubs.

### IDs & Idempotency
- `uuidv7()` from `uuidv7` package for all IDs — never `crypto.randomUUID()` or `gen_random_uuid()`.
- DO NOT use `Date.now()` in notification idempotency keys — pass deterministic timestamp from mutator.

### React Compiler
- Keep `useMemo`/`useCallback` for props passed to third-party components using them as internal effect deps (e.g., `ZeroProvider`).
- Keep `useCallback` on shared hook return values (`useConfirmAction`, `useDialogManager`, etc.) for stable refs.
- DO NOT remove `useMemo`/`useCallback` from shared hooks or third-party component prop boundaries.

### Permissions
- `assertHasPermission(ctx, "permission.id")` for auth — never `assertIsAdmin` or `role === "admin"`.
- `can(ctx, "id")` for conditional checks; `hasPermission("id")` from AppContext on client.
- New permissions: `packages/db/src/permissions.ts` (auto-syncs on boot). Don't delete/rename IDs without migrating `rolePermission` rows.
- Separate `{entity}.view` (pickers/queries) from `{entity}.manage` (admin pages) when admin page exposes sensitive details.

### Jobs & Enqueue
- `enqueue()` from `@pi-dash/jobs` for all async side-effects (notifications, Courier sync, WhatsApp). Never call directly from server functions/auth hooks/mutators. Exception: `notifyUserDeleted` (sync before deletion).
- Wrap in `withFireAndForgetLog()` when enqueue is side-effect. Only `await enqueue()` if enqueue IS primary operation.
- `withTaskLog()` from `@pi-dash/observability` only for in-process retry (not pg-boss enqueue).

### Mutation Results
- Use `handleMutationResult()` from `@/lib/mutation-result` for Zero mutation server results — never inline `if (res.type === "error") { toast.error(...) }`.

### General Discipline
- Check nearest `package.json` before running scripts. Keep changes scoped to affected package(s).
- New DB table in `packages/db/src/schema/`: add idempotent seed data in `scripts/seed.ts` (2-3 records, `onConflictDoNothing()`).
- New `packages/*` workspace: add `COPY packages/<name>/package.json packages/<name>/` to `Dockerfile` before `RUN bun install`.
- DO NOT: invent commands not in repo manifests, broad refactors during focused tasks, speculative abstractions, "improve" adjacent code unrelated to request, backwards-compat shims (re-exports, type aliases, `// removed` comments).

## Validation and Done

**Done when**: task goal satisfied, changed files listed, relevant checks passed (or reason given), no generated-file edits, no stale references, E2E tests for major features.

| Command | Purpose |
|---|---|
| `bun run check:types` | TypeScript type check |
| `bun run check` | Linter (ultracite/Biome) |
| `bun run fix` | Auto-fix linter issues |
| `bun run check:unused` | Unused exports (knip) |
| `bun run test:unit` | Unit tests (Vitest) |
| `bun run db:generate` | Migration SQL from Drizzle |
| `bun run db:migrate` | Apply pending migrations |
| `bun run zero:generate` | Regenerate Zero schema |
| `bun run seed` | Seed dev data (idempotent) |
| `bun run test:seed` | Seed E2E test data |
| `bun run test:e2e` | E2E tests via Turborepo |
| `bun run test:e2e:ui` | E2E tests Playwright UI mode |
| `cd packages/e2e && bash run-e2e.sh` | E2E tests (full stack) |
| `bun run ruler:apply` | Apply Ruler config |
| `bun run dev:webhook-proxy` | WhatsApp webhook proxy (local dev) |

- lefthook pre-commit: type check, lint, unit tests, unused-exports in parallel.
- commitlint enforces conventional commits.

## Documentation Upkeep

- Major feature → update `README.md` and `.ruler/agent-guide.md`.
- Structural change (routes, env vars, paths, patterns) → update `project-structure.md`.
- Architectural change (data layer, auth, sync, notifications) → update the matching chapter in `docs/architecture/`.
- Deployment change (env vars, services, build steps) → update `DEPLOYMENT.md`.

Read `project-structure.md` for structure/paths, `DEPLOYMENT.md` for production setup.

## Architecture Docs (On-Demand)

Architecture docs live at `docs/architecture/` as sharded chapters. **Do NOT load them by default.** Load ONLY when the current task matches a trigger below.

**Protocol**:
1. If task matches any trigger → first `rtk read docs/architecture/index.md` (topic map).
2. Then `rtk read docs/architecture/<chapter>.md` for each matching topic. Multiple chapters allowed.
3. If task does not match any trigger → skip architecture docs entirely.

**Load triggers (read the matching chapter)**:
- Zero mutators, Zero queries, Drizzle schema, connection pool, sync flow, SSR loaders, `ZeroProvider`, IndexedDB, optimistic updates → `data-layer.md`
- Better Auth, session cookie, sign-in flow, `getAuth`, `getCachedAuth`, `requireSession` → `auth.md`
- Permissions, roles, `assertHasPermission`, `can`, `hasPermission`, `resolvePermissions`, role hierarchy → `authorization.md`
- Recurring events, RRULE, `teamEvent` recurrence, `seriesId`, `originalDate`, materialize, exdate → `recurring-events.md`
- Vendor payment, VP status, invoice approval, `recalculateParentStatus` → `vendor-payments.md`
- `enqueue()`, pg-boss, Courier, WhatsApp poll, notification topic preferences, `notify-*` handlers, webhook proxy → `notifications.md`
- Cloudflare R2 presign, attachments, Immich sync, event photos → `file-uploads.md`
- Cash voucher PDF, `generate-cash-voucher`, `VOUCHER_ORG_*` → `cash-vouchers.md`
- evlog, `createRequestLogger`, `withTaskLog`, `withFireAndForgetLog`, `/api/log/ingest` → `observability.md`
- pg-boss handlers, job schedules, `createNotifyHandler`, `singletonKey`, 42 handlers → `jobs.md`
- `@react-pdf/renderer`, voucher layout, `amount-to-words` → `pdf.md`
- `@pi-dash/editor`, Plate.js, `PlateEditor`, `PlateRenderer`, `onImageUpload` → `editor.md`
- `@pi-dash/shared`, `ALLOWED_IMAGE_TYPES`, reminder presets, client/server constant boundary → `shared.md`
- New workspace, package layout, Turborepo, Dockerfile copy lines → `monorepo.md`

**DO NOT read architecture docs for**: UI copy/style tweaks, CSS changes, component restyling, lint fixes, dep bumps, test-only changes, typo fixes, commit message drafting, config-file edits outside the listed triggers, dev-tool config. In these cases skip the index entirely.

**When unsure**: skip the docs, start reading code. Only reconsider if code surfaces architectural patterns you don't recognize.

## GrepAI Usage Policy

- **"I know name"** → `rtk grep` (or Glob). 100% recall. Default for known symbols/patterns/regexes.
- **"I know intent"** → `grepai search "<query>" -t -c` first. Then narrow with `rtk grep`. Workflow: **grepai discovers → rtk grep narrows → Read confirms**.
- **"I need impact analysis"** → `grepai trace callers/callees` for project-local direct-call functions. `rtk grep` for external symbols, function-ref patterns, string-based dispatch.
- Phrase queries with 4-6 domain-specific nouns. Never put known function names into grepai queries.
- If first query scores < 0.70, rephrase before falling back.
- **trace callers**: ~100% recall, 97% precision for direct calls. Returns 0 for external symbols, function-ref patterns, string dispatch. Filter phantom `field.tsx`.
- **trace callees**: ~70% precision (stdlib noise), ~80% recall. Cannot trace external packages.
- **trace graph**: Same limits. Use `--depth 2`.
- CLI flags: Search `-t -c`. Trace `-t` only.

## MCP Usage Policy

- Context7 MCP by default for library/API docs, setup, config guidance.
- Jina MCP to verify uncertain knowledge with current sources.
- `search_arxiv`/`search_ssrn` always paired with `read_url`/`parallel_read_url`.
- Never run `search_web`/`search_arxiv`/`search_ssrn` alone.
- Library docs: Context7 with IDs from `project-structure.md` § Documentation References.

## Skills Policy

**Invoke matching skill before starting**: form (`create-form`), UI data table (`create-data-table`), dialog (`create-dialog`), logging/error handling (`add-logging`), Zero queries (`zero-patterns`), E2E tests (`e2e-testing`), commit (`git-commit`), review (`code-review`), worktree (`worktree-dev`), browser test (`playwriter`), cleanup (`deslop`).

**Decision rules:**
- Bug IN skill-covered component → invoke skill. Bug NEAR but not IN (runtime, API, scheduling) → skip.
- `git-commit` only when committing requested. `code-review` only for diff review. `deslop` only for explicit cleanup language ("clean up", "final pass", "remove slop").
- `create-data-table` = UI tables only, not DB tables/migrations/schema. `zero-patterns` = Zero query hooks/sync only, not plain `createServerFn`.
- Don't stack unrequested skills. Don't preload component skills for generic feature requests.
- User-invoked only: `react-doctor`, `design-motion-principles`.

**Multi-skill triggers:**
- Dialog with input fields → `create-dialog` + `create-form`. Approval/rejection flows collecting user input → same.
- Zero query feeding table → `zero-patterns` + `create-data-table`. Table toolbar controls part of `create-data-table` alone.
- Review skills (`code-review`, `deslop`) before `git-commit`. Creation skills before `e2e-testing`. `add-logging` during implementation.

Discovery: `skills-lock.json`, `.agents/skills`, `.claude/skills`.

## Editor Patterns

- `@pi-dash/editor` exports: `@pi-dash/editor/editor` (`PlateEditor`) and `@pi-dash/editor/renderer` (`PlateRenderer`, read-only).
- `onImageUpload`: `(file: File) => Promise<{ url: string } | undefined>`. Validation inside editor; adapter handles transport.
- Image MIME types: `ALLOWED_IMAGE_TYPES` from `packages/shared/src/constants.ts`.
- Plugin composition: `packages/editor/src/editor.tsx` (all plugins), `packages/editor/src/renderer.tsx` (read-only subset).
- Web adapter: `apps/web/src/components/editor/plate-editor.tsx` wraps with S3 presign. `entityId` in adapter, not editor package.
- Lazy-load: `React.lazy(() => import("@pi-dash/editor/editor"))`.

## Compact instructions

When compacting, preserve: file paths, code changes, architectural decisions, test results, webfetch content summaries.
Discard: exploration output, intermediate search results, verbose tool output.