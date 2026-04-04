---
name: zero-patterns
description: Use when writing or modifying Zero query hooks, loading states, or data-derived computations. Ensures correct handling of Zero sync states and prevents skeleton/content flash cycles.
---

# Zero Query Patterns

Zero keeps cached data during re-sync (`type === "unknown"`). Never gate UI on `"unknown"` — it causes skeleton/content flash cycles.

- DO: Derive loading state from **data emptiness + type**: `const isLoading = data.length === 0 && result.type !== "complete"`. This shows skeleton only on first load; once data is cached it persists through re-sync.
- DO: For singular queries (`.byId`): `const isLoading = !item && result.type !== "complete"`.
- DO: Always compute derived data (stats, counts, filters) from the live query data — never gate computation on `isLoading`. This prevents values flashing to 0 during re-sync.
- DO NOT: Check `result.type === "unknown"` to show loading UI — Zero returns cached data during `"unknown"`, so it's never truly empty after first load.
- DO NOT: Use per-query error hooks — connection errors are handled globally by `ZeroConnectionMonitor` in `_app.tsx` via `useConnectionState()`.
- DO NOT: Pass unstable object references (e.g., `session` from `authClient.useSession()`) as `useMemo` dependencies for ZeroProvider props — extract stable primitives (`userId`, `role`) instead. Unstable refs cause ZeroProvider to reinitialize and remount the entire app.
- INSTEAD: For DB schema changes, run `bun run db:generate` then `bun run db:migrate`.
- DO: When merging branches that both created Drizzle migrations at the same index, resolve by: (1) keep master's migrations as-is, (2) renumber yours to the next index (e.g., `0028_`), (3) rename the `.sql` file and its snapshot in `meta/`, (4) update `_journal.json` with the new idx, tag, **and a `when` timestamp that is greater than the latest existing migration's `when`**. Drizzle uses timestamps — not filenames — to determine execution order. A migration with an older `when` than the last applied migration will be silently skipped.
