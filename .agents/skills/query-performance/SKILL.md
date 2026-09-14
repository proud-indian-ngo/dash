---
name: query-performance
description: Use when implementing or changing Zero query relationships, route preloads, access-request coordination, or database queries and indexes in pi-dash. Prevents data-loading performance regressions while preserving permissions and local caching.
---

# Prevent query performance regressions

Apply these rules to the code being changed. A routine query edit needs focused checks, not a new app-wide audit. Use [the data-layer chapter](../../../docs/architecture/data-layer.md) for current implementation details and [zero-patterns](../zero-patterns/SKILL.md) for hook loading/sync-state rules.

## Give every relationship a consumer

Before adding `.related(...)`, identify the fields the caller reads. Keep list summaries, pickers, transport lookups and full details as deliberate projections. Reuse their root authorization scope rather than copying permission logic into each projection.

Trace all consumers before narrowing a shared query, including aliases and casts. A broad TypeScript row cast does not prove that a narrower result still supplies required relationships. Where casts hide the contract, verify the returned graph explicitly.

Use already-loaded data for derived counts when appropriate. Avoid expanding the same hierarchy through multiple paths just to compute the same result, such as both an Edition's direct Divisions and its Competitions' nested Divisions.

**Check:** every added relation supplies a field or an intentional warming purpose; every removed relation has verified consumers. Keep the full authorized root dataset where local filtering and pagination depend on it.

## Preserve useful caching

Zero owns synced data and deduplication. A page showing 50 rows can legitimately retain thousands locally. Choose projections from consumer needs, not visible row count.

Overlapping query results still incur query work, but they can prepare later subscriptions. Removing an apparently unused expansion can reduce analyzer time while making navigation slower. When changing an existing warming path, compare fresh-context navigation and warm returns to usable content before accepting it.

**Check:** caching changes preserve warm content and do not introduce an empty-loading flash. Use the existing sync-state conventions linked above.

## Bound speculative work

Use the existing `preloadRouteQuery` helper for route warming. It uses Zero preload semantics and releases its owner on completion, abort or timeout. Mounted consumers retain their own subscriptions; inactive queries may continue syncing during their TTL.

Keep route speculation intent-driven. Displaying a navigation menu should not start authorization and hydration work for every destination. Start a page-only query when its authorized consumer mounts unless a measured navigation benefit justifies earlier warming.

Keep warming non-blocking and avoid converting large preload results into JavaScript objects through `run()` or materialization. Extend the existing ownership mechanism rather than adding an independent query cache.

**Check:** completion, abort and timeout release the preload exactly once; an already-aborted/SSR path is safe; mounted consumers stay subscribed. Test lifecycle changes at the helper boundary.

## Keep authorization reactive and avoid duplicate checks

Preserve server authorization and reactive Zero predicates. Client-side enabled flags can avoid useless requests but cannot grant access. Manager-only queries should start only for consumers that can use them.

For duplicate route access requests, reuse the existing browser-only in-flight coordinator. Share pending promises by session identity and lookup arguments; preserve retries, invalidation and identity-safe cleanup. Keep settled authorization results out of this coordinator and shared user state out of SSR.

Simplify repeated relationship predicates only when the relationship keys and database constraints prove equivalent scope. A parent `whereExists` may already authorize the exact row returned by its related expansion; a similar-looking relationship is not sufficient evidence.

**Check:** include the affected restricted role, denied scope and exact nested results. For permission-graph changes, verify that revocation removes access while the consumer remains mounted.

## Match indexes to demonstrated access paths

Inspect the query's actual filters, ordering and tie-breaker before proposing an index. Composite indexes can support a per-parent lookup and its ordering when separate indexes cannot. Repeated primary-key reads often reflect relationship/authorization work rather than a missing index.

Treat reduced scans as reduced work, not automatically faster pages. Weigh the benefit against storage and write maintenance; a temporary sort over a tiny group does not automatically justify another index. Retain experimental status when the benefit is unproven.

Follow repository approval and generation rules. Check schema ownership before touching package-managed tables such as pg-boss. Validate an accepted generated migration on a fresh local database with disposable index experiments disabled.

**Check:** the real migration selects the intended plan, preserves results and does not rely on an experimental index left in the test database.

## Verify the path that changed

Use a representative workload for nontrivial performance changes. Include the relevant restricted role: global administrators often bypass the expensive predicates. Many interests spread across many Events do not exercise a large single-Event queue; individual Entries do not exercise group-member expansion. Assert roots, nested counts and forbidden data, not just successful rendering.

Keep these measurements distinct: PostgreSQL execution, Zero replica scans/reads/synced rows, server hydration, total hydration and navigation/rendering time. Confirm diagnostic flags against the deployed version and running configuration before relying on their output. `pg_stat_statements` does not measure Zero's SQLite query execution.

Use repeated samples when timing drives the decision. If a cheaper query makes navigation slower, return to the baseline and rework or reject the candidate. Preserve the uncertainty when results vary.

Use the existing [E2E workflow](../e2e-testing/SKILL.md) and [performance fixtures](../../../docs/architecture/e2e-testing.md). Associate reports with the candidate and fixture mode, and read them only after the producing process finishes. Reports should contain counts/plans/timings, not credentials or record contents.

**Done:** required data, permissions and cache behavior are preserved; the affected path has appropriate verification; any claimed improvement matches the measured layer. Record substantial comparisons and rejected hypotheses in [the audit](../../../docs/query-performance-audit.md). Production improvement remains unverified until the deployed revision is measured.
