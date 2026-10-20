# Monorepo

> **Load when**: new workspace, Turborepo, Dockerfile, build topology.
> **Related**: `data-layer.md`, `jobs.md`, `project-structure.md`

Turborepo with Bun workspaces. `project-structure.md` maps the packages.

## Adding a workspace

Add `COPY packages/<name>/package.json packages/<name>/` to the `Dockerfile` copy layer before `RUN bun install`, or the Docker build breaks.

## Docker build

- `bun install` runs with `--ignore-scripts`. `@rocicorp/zero-sqlite3` would otherwise compile a native addon, and the slim image has no Python or g++. The web build and migrator never load it.
- zero-cache runs from the `rocicorp/zero` image. Keep it on the same minor as the `@rocicorp/zero` catalog version.
- The build stage sets `SKIP_VALIDATION=true` because runtime variables are absent at build time.

## Web compilation

Split client code along route and dynamic-import boundaries, coalescing the router entry's static dependencies into a startup chunk and the authenticated layout's dependencies into a separate chunk. The startup group takes precedence so shared helpers cannot pull the private shell into public startup. Route loaders split with their components. Package-wide vendor groups can capture shared dependencies and pull lazy features into startup. Check the emitted import graph and cold-load requests before changing grouping.

Keep permission hooks shared by lists and editors outside editor modules. Importing a small hook from an editor can pull the editor's form dependencies into list navigation. Check the next detail/editor interaction too when moving that boundary.

Nitro precompresses public assets, so the origin serves compressed JavaScript and CSS without relying on a CDN. Keep the compression/revalidation E2E check when changing asset serving. The root preloads the body font; display and data fonts load when used so they do not compete with initial scripts. All use hashed asset URLs with long-lived caching.

TanStack Start inlines production CSS in HTML to avoid a blocking stylesheet request. The origin streams HTML with negotiated Brotli or gzip and varies on `Accept-Encoding`; compression must preserve stream errors, cancellation and response headers. Place the body-font preload after the inline styles so it does not compete with their download.

`apps/web/vite.config.ts` excludes ReUI's `data-grid-table.tsx` and `data-grid-table-dnd.tsx` from React Compiler. They read column widths and pin offsets through stable references to mutable TanStack state, so compiler caching leaves stale geometry after resizing or pinning. Keep the exclusion until upstream is compiler-safe, and verify changes against real browser geometry. The same applies to compiled app components: TanStack keeps a `row` object stable when its expanded or selected state changes, so pass `row.getIsExpanded()` in as a prop rather than reading it inside the component.

The compiler runs on `@babel/core` 7 (`react-compiler-preset.test.ts` asserts it): compiler 1.0 reads Babel 7 ASTs and on Babel 8 skips every component with a destructuring default. The build skips a component silently, so `bun run check` runs `check:compiler`, which fails on any skipped component or hook in `apps/web/src`. Common bail-outs and their fixes:

- `try` with `finally` or without `catch`, a `?:`, `&&` or `?.` inside `try`, or `throw` inside `try`: chain `.then`, `.catch` and `.finally` on the promise, or move the body into a module-level async function.
- A read of a binding declared further down: move the declaration up.
- `ref.current = value` during render: use `useEventCallback`.
- `import()` in a component: a module-level loader.
- `++` on a variable a closure captures: reassign instead.

Leave memoization to the compiler and confirm in the compiled output that the value is cached. Keep `useMemo` where it is not, and where the compiler merges an expensive value into a wider cache scope; `data-table-wrapper.tsx` keeps both kinds.

In table sizing (`components/data-table/column-fill.ts`), the last visible unpinned column absorbs spare width. Viewport-derived fill is never persisted.

## Dev tooling

Lefthook's post-checkout hook, in a linked worktree, copies `.env` from the main worktree when missing and reruns `bun run ruler:apply` when `CLAUDE.md` is missing or older than `.ruler/agent-guide.md`.
