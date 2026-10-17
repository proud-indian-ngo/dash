# Observability

> **Load when**: evlog, `createRequestLogger`, `withTaskLog`, `withFireAndForgetLog`, `/api/log/ingest`, request or error logging.
> **Related**: `jobs.md`, `notifications.md`

All logging uses evlog wide events. Never use `console.error`, on the server or the client.

## Server logging

| Helper | From | Use |
|---|---|---|
| `createRequestLogger()` | `evlog` | One wide event: `log.set()` for context, `log.error()` for errors, `log.emit()` to flush |
| `withTaskLog()` | `@pi-dash/observability` | In-process retry with logging. Not for enqueueing; pg-boss has its own retry |
| `withFireAndForgetLog()` | `@pi-dash/observability` | Fire-and-forget with logging; no retry, no rethrow |

## Request events

`apps/web/server/middleware/request-logger.ts` creates the logger before awaiting the handler, because evlog computes `durationMs` from logger creation at emit time and overwrites any manual value. The duration covers handler execution only.

Job handlers log through `createNotifyHandler()`.

## Client logging

Client catch blocks use `log.error()` from `evlog`; errors ship to `/api/log/ingest`.
The anonymous ingest endpoint accepts the client's 25-event batch, limits each
body to 256 KiB, and rate limits each trusted client IP. Error events are sent
to PostHog in one best-effort batch per request.

Zero mutation results go through `handleMutationResult()` (`apps/web/src/lib/mutation-result.ts`), which logs and shows an error toast. Do not inline `if (res.type === "error") toast.error(...)`.
