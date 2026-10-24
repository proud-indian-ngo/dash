# Monorepo

> **Load when**: new workspace, Turborepo, Dockerfile, build topology, production server, slow responses or idle timeouts.
> **Related**: `data-layer.md`, `jobs.md`, `project-structure.md`

Turborepo with Bun workspaces. `project-structure.md` maps the packages.

## Adding a workspace

Add `COPY packages/<name>/package.json packages/<name>/` to the `Dockerfile` copy layer before `RUN bun install`, or the Docker build breaks.

## Remote cache

Turbo's remote cache is a self-hosted [turborepo-remote-cache](https://github.com/ducktors/turborepo-remote-cache) at `cache.thari.in`, a Dokploy compose service storing on local disk; a sidecar deletes artifacts older than 7 days. `turbo.json` turns on artifact signing, so the server and every client share `TURBO_REMOTE_CACHE_SIGNATURE_KEY` and an unsigned or wrongly signed artifact is a miss. `TURBO_TOKEN` and the key live in `.env` and in the repository's GitHub secrets. Without them, as in fork PRs, Turbo warns and builds.

A cache hit is only as safe as the task's declared inputs, so a task that reads anything outside its workspace's tracked files must list it in `turbo.json`:

- `check:compiler` hashes web's non-test sources and its script. It compiles each file on its own, so imported workspaces are not inputs, and its result is deterministic.
- `test:unit` depends on `transit`, so a workspace's tests rerun when a workspace it imports changes. Suites load the root `.env` and `.env.worktree` (web with `--env-file`, the rest through `@pi-dash/env`), so both are inputs; this also keeps local and CI results apart, since CI's `.env` is `.github/ci.env`. Web's give.do import test reads an E2E fixture, listed under `web#test:unit`.
- About 40 test files read today's date, so a pass can go stale with no input change. CI's unit-tests job sets `TURBO_FORCE` on every run but a pull request's, so master always runs every suite and a date-dependent failure surfaces there.
- The root `package.json` depends on several workspaces for its scripts, and Turbo folds those workspaces, with their own dependencies, into the global hash. A change to any of them misses every task; only web, `e2e` and `editor` change on their own.

## Docker build

- `bun install` runs with `--ignore-scripts`. `@rocicorp/zero-sqlite3` would otherwise compile a native addon, and the slim image has no Python or g++. The web build and migrator never load it.
- zero-cache runs from the `rocicorp/zero` image. Keep it on the same minor as the `@rocicorp/zero` catalog version.
- The build stage sets `SKIP_VALIDATION=true` because runtime variables are absent at build time.
- The production image has no `node_modules` beyond React, so it carries the migrator as `bun build` bundles. A new import in `migrate.ts` or `prepare-publication.ts` is bundled automatically; a new file either reads at runtime must be copied in the `migrate-bundle` stage.

## Web compilation

Split client code along route and dynamic-import boundaries, coalescing the router entry's static dependencies into a startup chunk and the authenticated layout's dependencies into a separate chunk. The startup group takes precedence so shared helpers cannot pull the private shell into public startup. Route loaders split with their components. Package-wide vendor groups can capture shared dependencies and pull lazy features into startup. Check the emitted import graph and cold-load requests before changing grouping.

Keep permission hooks shared by lists and editors outside editor modules. Importing a small hook from an editor can pull the editor's form dependencies into list navigation. Check the next detail/editor interaction too when moving that boundary.

Nitro precompresses public assets, so the origin serves compressed JavaScript and CSS without relying on a CDN. Keep the compression/revalidation E2E check when changing asset serving. Source-map processing must follow the [asset finalization rules](observability.md#posthog).

The root preloads the body font; display and data fonts load when used so they do not compete with initial scripts. All use hashed asset URLs with long-lived caching.

TanStack Start inlines production CSS in HTML to avoid a blocking stylesheet request. The origin streams HTML with negotiated Brotli or gzip and varies on `Accept-Encoding`; compression must preserve stream errors, cancellation and response headers. Place the body-font preload after the inline styles so it does not compete with their download.

`apps/web/vite.config.ts` excludes ReUI's `data-grid-table.tsx` and `data-grid-table-dnd.tsx` from React Compiler. They read column widths and pin offsets through stable references to mutable TanStack state, so compiler caching leaves stale geometry after resizing or pinning. Keep the exclusion until upstream is compiler-safe, and verify changes against real browser geometry. The same applies to compiled app components: TanStack keeps a `row` object stable when its expanded or selected state changes, so pass `row.getIsExpanded()` in as a prop rather than reading it inside the component.

The compiler runs on `@babel/core` 7 (`react-compiler-preset.test.ts` asserts it): compiler 1.0 reads Babel 7 ASTs and on Babel 8 skips every component with a destructuring default. The build skips a component silently, so `bun run check` runs `check:compiler`, which fails on any skipped component or hook in `apps/web/src`; the pre-commit hook runs it on staged web sources. Common bail-outs and their fixes:

- `try` with `finally` or without `catch`, a `?:`, `&&` or `?.` inside `try`, or `throw` inside `try`: chain `.then`, `.catch` and `.finally` on the promise, or move the body into a module-level async function.
- A read of a binding declared further down: move the declaration up.
- `ref.current = value` during render: use `useEventCallback`.
- `import()` in a component: a module-level loader.
- `++` on a variable a closure captures: reassign instead.

Leave memoization to the compiler and confirm in the compiled output that the value is cached. Keep `useMemo` where it is not, and where the compiler merges an expensive value into a wider cache scope; `data-table-wrapper.tsx` keeps both kinds.

In table sizing (`components/data-table/column-fill.ts`), the last visible unpinned column absorbs spare width. Viewport-derived fill is never persisted.

## Production server

Production runs Nitro's `bun` preset, which serves through srvx on `Bun.serve`. Bun drops a request that moves no bytes for its idle timeout, 10 seconds by default, so a download that builds a file before its first byte, a slow storage read mid-stream, or a server function running a long query would be cut. The preset passes no `idleTimeout` to `Bun.serve`, so `apps/web/server/middleware/idle-timeout.ts` raises it to 255 seconds, Bun's maximum, for every request with `server.timeout()`. A handler that can sit idle longer than the limit below must send bytes sooner, or move the work to a job. Vite's dev server has no such timeout, so check a slow path against a built server (`bun run build`, then `bun run start`).

The domain is proxied by Cloudflare, which returns a 524 when the origin sends nothing for 100 seconds, so in practice a handler must send bytes within 100 seconds; Dokploy's Traefik sits behind it, configured outside this repository.

On SIGTERM, srvx stops accepting connections and lets open requests finish for `SERVER_SHUTDOWN_TIMEOUT` seconds (5 unless set) before closing them. Production sets it to 100, Cloudflare's limit, and the container's stop grace period above that, so a deploy doesn't cut a running download. An idle server exits within seconds.

## Dev tooling

Keep the TanStack Devtools Vite plugin disabled until its event endpoint authenticates callers and its package installer avoids shell interpolation. The browser-only router and form panels can run without that server plugin.

Lefthook's post-checkout hook, in a linked worktree, copies `.env` from the main worktree when missing and reruns `bun run ruler:apply` when `CLAUDE.md` is missing or older than `.ruler/agent-guide.md`.
