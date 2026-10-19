# Observability

> **Load when**: evlog, `createRequestLogger`, `withTaskLog`, `withFireAndForgetLog`, `/api/log/ingest`, request or error logging, PostHog.
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
body to 256 KiB, and rate limits each trusted client IP. Ingested events stay
logs, marked `source: "client"`; they never reach Error Tracking.

## PostHog

Every server event and PostHog event carries `APP_ENV` and the release, the commit SHA the Docker build reads from `.git` (see `DEPLOYMENT.md`). Local builds have no release.

**Server errors.** The evlog drain in `server/plugins/logger.ts` exports logs over OTLP and sends each server event at `error` level with an `error` field to Error Tracking through `posthog-node`, rebuilt from the stack evlog keeps in production. 4xx and abort errors are skipped. An error that no code passes to `log.error()` carries no `error` field, so it never reaches Error Tracking.

**Browser.** posthog-js owns browser errors: it captures window errors and unhandled rejections, and the two error boundaries capture what they catch, once per error. Console errors are not captured, since React logs every caught error there. Pageviews are route templates (`/teams/$id`), one per pathname. `before_send` drops IPs, raw URLs, referrers and query strings in stack frames, and disables GeoIP; the PostHog project must also have **Discard client IP data** on. Identity is the opaque user ID and role, reset on logout and before another account identifies.

**Zero.** zero-cache exports logs only when `ZERO_OTEL_LOGS_EXPORTER` is set.

Zero mutation results go through `handleMutationResult()` (`apps/web/src/lib/mutation-result.ts`), which logs and shows an error toast. Do not inline `if (res.type === "error") toast.error(...)`.
