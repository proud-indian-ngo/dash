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

Both skip 4xx (the first numeric `status` or `statusCode` on the error or its cause) and abort errors. The status is the marker, since Start answers with it, better-auth's errors carry one and packages can set it without importing the app; the cost is that an error carrying an upstream API's 4xx is skipped too. Expected refusals therefore carry one:

- `HttpError` takes 400 for input the server refuses, 409 for a request the records' current state refuses, 429, and 401, 403 and 404 ([authorization](authorization.md#enforcement)).
- The function middleware answers Start's input-validator failure, a plain `Error` whose message is the schema's issues as JSON, as a 400.
- `withSafeErrors` and the governance functions' `userFacing` turn domain errors written for the user into 409s with only their message. A package error that is always a refusal sets `status` itself, as `PartyConflictError` does.
- `logErrorAndRethrow` logs refusals as warnings.

Zero mutator refusals never reach Error Tracking: the push handler returns them as results, and Zero logs them to the console. Each error is captured once per request, matched by object or by name and message: a handler that passes an error to `log.error()` and rethrows it is reported by the drain only, and a different error thrown later in the same request is still reported. Messages, stacks and causes are scrubbed first: a Drizzle query error's `params:` values are dropped, and emails, card numbers, JWTs, bearer tokens, IBANs, phone numbers with a country code, and Indian mobile numbers without one (10 digits from 6 to 9, optionally after 0 or 91) are masked. Longer digit runs, IDs joined by `_`, decimals and dates stay. Routes are path templates, with UUID, long hex and numeric segments as `:id`. Loader and `beforeLoad` errors during SSR are not captured on the server unless they come from a server function: the router renders them into the error boundary, so the request middleware never sees a throw, and Start has no router-wide hook. The router dehydrates the error, so the browser's boundary captures it after hydration, without the server stack.

**Browser.** Routine analytics initialization waits for the page load event so its SDK download does not compete with initial assets; error boundaries can load it immediately. posthog-js owns browser errors: it captures window errors and unhandled rejections, and the two error boundaries capture what they catch, once per error. Console errors are not captured, since React logs every caught error there. Pageviews are route templates (`/teams/$id`), one per pathname. `before_send` drops IPs, raw URLs, referrers and query strings in stack frames, and disables GeoIP; the PostHog project must also have **Discard client IP data** on. Identity is the opaque user ID and role, reset on logout. A switch to another account resets it only within one page load, since the identified ID is module state.

**Source maps.** The client build emits hidden source maps, so browsers never fetch them; the Docker build uploads them to PostHog and deletes the maps and their compressed variants, so they never ship, and `/assets/*.map` answers 404. The upload is best effort: a skipped or failed upload leaves that release unsymbolicated, and the build still succeeds. After either outcome, the build recreates Nitro's existing compressed JavaScript from the final chunks because the CLI can rewrite them. Redeploying a commit does not retry an upload ([DEPLOYMENT.md](../../DEPLOYMENT.md#observability)). Server code has no maps: Nitro's output is unminified enough to read.

**Zero.** zero-cache exports logs only when `ZERO_OTEL_LOGS_EXPORTER` is set.

Zero mutation results go through `handleMutationResult()` (`apps/web/src/lib/mutation-result.ts`), which logs and shows an error toast. Do not inline `if (res.type === "error") toast.error(...)`.
