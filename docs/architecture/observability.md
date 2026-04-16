# Observability

> **Load when**: evlog, `createRequestLogger`, `withTaskLog`, `withFireAndForgetLog`, `log.error`, `log.set`, `log.emit`, `/api/log/ingest`, error logging discipline.
> **Related**: `jobs.md`, `notifications.md`

## Server-Side Logging (evlog)

All server-side logging uses **evlog wide events**. **Never `console.error`**.

| Helper | Location | Purpose |
|---|---|---|
| `createRequestLogger()` | `evlog` | Creates wide-event logger; `log.set()` for context, `log.error()` for errors, `log.emit()` to flush |
| `withTaskLog()` | `packages/observability` | Wraps async tasks with retry (p-retry, 3 attempts) + evlog |
| `withFireAndForgetLog()` | `packages/observability` | Fire-and-forget with evlog (no retry, no re-throw) |

Logger initialized at `apps/web/src/lib/logger.ts`, imported by `entry-server.ts`.

`withTaskLog()` is for **in-process retry only** — not pg-boss enqueue. pg-boss has its own retry.

## Client-Side Logging

Client logger init: `apps/web/src/lib/client-logger.ts`. Errors shipped to `/api/log/ingest`. Client catch blocks use `log.error()` from `evlog` — **never `console.error`**.

## Mutation Results

`handleMutationResult()` from `apps/web/src/lib/mutation-result.ts` handles Zero mutation server results — logs via evlog + shows toast on error. Never inline `if (res.type === "error") { toast.error(...) }`.
