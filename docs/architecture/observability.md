# Observability

> **Load when**: evlog, `createRequestLogger`, `withTaskLog`, `withFireAndForgetLog`, `log.error`, `log.set`, `log.emit`, `/api/log/ingest`, request logging, error logging discipline.
> **Related**: `jobs.md`, `notifications.md`

All logging uses evlog wide events. Never use `console.error`, on the server or the client.

## Server logging

| Helper | From | Use |
|---|---|---|
| `createRequestLogger()` | `evlog` | One wide event: `log.set()` for context, `log.error()` for errors, `log.emit()` to flush |
| `withTaskLog()` | `@pi-dash/observability` | In-process retry (p-retry, 3 attempts) with logging. Not for enqueueing; pg-boss has its own retry |
| `withFireAndForgetLog()` | `@pi-dash/observability` | Fire-and-forget with logging; no retry, no rethrow |

The logger is initialised in the Nitro plugin `apps/web/server/plugins/logger.ts`.

## Request events

`apps/web/server/middleware/request-logger.ts` logs each request. It creates the logger before awaiting the handler, because evlog computes `durationMs` from logger creation at emit time and overwrites any manual value. The duration covers handler execution only, not network or response-body transfer. `/api/log/ingest`, `/api/health`, `/api/version` and asset paths are skipped.

Job handlers log through `createNotifyHandler()` (see `jobs.md`).

## Client logging

`apps/web/src/lib/client-logger.ts` initialises the client logger and ships errors to `/api/log/ingest`. Client catch blocks use `log.error()` from `evlog`.

Zero mutation results go through `handleMutationResult()` (`apps/web/src/lib/mutation-result.ts`), which logs and shows an error toast. Do not inline `if (res.type === "error") toast.error(...)`.
