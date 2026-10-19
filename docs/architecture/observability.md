# Observability

> **Load when**: evlog, `createRequestLogger`, `withTaskLog`, `withFireAndForgetLog`, `/api/log/ingest`, request or error logging, PostHog, source maps.
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

**Server errors.** Two paths send server errors to Error Tracking through one `posthog-node` client (`apps/web/src/lib/server/error-tracking.ts`):

- The evlog drain in `server/plugins/logger.ts` exports logs over OTLP and sends each server event at `error` level with an `error` field, rebuilt from the stack evlog keeps in production.
- Middleware in `apps/web/src/start.ts` captures what API routes and server functions throw, with the route or function name, trace ID and user, then rethrows, so responses are unchanged. A server-function throw still answers 200 with the serialized error; an `HttpError` answers with its status. Capture does not delay the response: the user lookup runs after the rethrow.

Both skip 4xx (the first numeric `status` or `statusCode` on the error or its cause), including `HttpError` ([authorization](authorization.md#enforcement)), and abort errors. Each error is captured once per request, matched by object or by name and message: a handler that passes an error to `log.error()` and rethrows it is reported by the drain only, and a different error thrown later in the same request is still reported. Messages, stacks and causes are scrubbed first: a Drizzle query error's `params:` values are dropped, and emails, card numbers, JWTs, bearer tokens, IBANs and phone numbers with a country code are masked. Routes are path templates, with UUID, long hex and numeric segments as `:id`. Loader and `beforeLoad` errors during SSR are not captured unless they come from a server function; Start has no router-wide hook for them.

**Browser.** posthog-js owns browser errors: it captures window errors and unhandled rejections, and the two error boundaries capture what they catch, once per error. Console errors are not captured, since React logs every caught error there. Pageviews are route templates (`/teams/$id`), one per pathname. `before_send` drops IPs, raw URLs, referrers and query strings in stack frames, and disables GeoIP; the PostHog project must also have **Discard client IP data** on. Identity is the opaque user ID and role, reset on logout. A switch to another account resets it only within one page load, since the identified ID is module state.

**Source maps.** The client build emits hidden source maps (no `sourceMappingURL` comment). In the Docker build stage, `posthog-cli sourcemap process` injects a chunk ID and the release ID into each client chunk and uploads the maps; posthog-js sends `$release_id` and the chunk IDs with each exception, so PostHog resolves frames to TypeScript. The upload is best effort: without the key, project ID or release it is skipped, and a failed upload leaves that release unsymbolicated. The CLI resolves the release before injecting, so a failure there leaves the bundle untouched. Every `.map` is deleted before the runtime stage, and a Rolldown plugin in `vite.config.ts` keeps maps out of Nitro's public asset manifest, so `/assets/*.map` answers 404 rather than 500. Injection runs after Nitro records asset sizes and ETags; those stay stale, which is harmless because chunk IDs are content-addressed. Server code has no maps: Nitro's output is unminified enough to read.

**Zero.** zero-cache exports logs only when `ZERO_OTEL_LOGS_EXPORTER` is set.

Zero mutation results go through `handleMutationResult()` (`apps/web/src/lib/mutation-result.ts`), which logs and shows an error toast. Do not inline `if (res.type === "error") toast.error(...)`.
