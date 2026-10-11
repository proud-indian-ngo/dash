# Social API

> **Load when**: `/api/social/v1`, social-artifacts pipeline, `social_api_token`, `social:token`, `requireSocialToken`, `social_post`, `event_partner`, post-event social form fields (`children_attended`, `social_notes`, `social_completed_at`, `volunteers_needed`), signed photo links, `SOCIAL_MEDIA_SIGNING_SECRET`, `social_approver_user_id`, social digest.
> **Related**: `recurring-events.md`, `file-uploads.md`, `notifications.md`, `caching.md`

Machine-facing API for the social-artifacts generator (Instagram and LinkedIn posts). Contract: `social-artifacts/docs/strategy/dashboard-api-spec.md`; the consumer's typed client (`social-artifacts/worker/src/pipeline/dashboard.ts`) is the source of truth for response shapes. No browser consumer, so no CORS.

## Auth

- `Authorization: Bearer <token>`, one token per consumer. Table `social_api_token` stores only the sha256 hex of the raw token, its `scopes` (`events:read`, `photos:read`, `signups:read`, `social:write`), `last_used_at` and `revoked_at`.
- `scripts/seed.ts` inserts a fixed dev token for local use only; it is skipped when `NODE_ENV` is `production` (`scripts/seed-social-token.ts`).
- Manage tokens in **Settings → API Tokens** (`settings.app_config`) or with the CLI fallback `bun run social:token create <name> --scopes …` (prints the raw token once), `list` and `revoke <id>`.
- The settings section talks to server functions in `apps/web/src/functions/social-api-tokens.ts` (`getSocialApiTokens`, `createSocialApiTokenFn`, `revokeSocialApiTokenFn`), because the table is not in Zero. Each checks `settings.app_config` with `assertServerPermission`. Create generates 32 random bytes (`generateSocialToken`), stores `hashSocialToken(raw)` and returns the raw token once; the dialog shows it with a Copy button and a warning that it cannot be shown again. Create and revoke run inside `runSessionAuditedAction` as `socialApiToken.create` / `socialApiToken.revoke`; metadata carries field names and scopes, never the token, its hash or the free-text name.
- `apps/web/src/lib/social-api-auth.ts`: `requireSocialToken(request, scope)` looks the token up by hash (so no constant-time compare is needed), checks scope membership (a list means "any of"), and touches `last_used_at` fire-and-forget. 401 for missing, unknown or revoked tokens, 403 for a missing scope, both `Cache-Control: no-store`. `authorizeSocialRequest` adds the in-process rate limit: 600 requests a minute per token and endpoint.
- `social_api_token` is deliberately not exported from the schema barrel, so it never enters the generated Zero schema.

## Endpoints

All under `apps/web/src/routes/api/social/v1/`; handlers with injectable dependencies live in `apps/web/src/lib/social-api/`. Every route answers other methods with 405.

| Endpoint | Scope | Notes |
|---|---|---|
| `GET events?from=YYYY-MM-DD&to=YYYY-MM-DD` | `events:read` | India-time dates, inclusive, at most 120 days counting both `from` and `to` (an impossible date such as `2026-13-01` is a 400), `from` may be in the past. `{ timezone: "Asia/Kolkata", events }` |
| `GET events/{id}/photos` | `photos:read` | `id` is a social event id: a `team_event` row id of a public, non-Kalakriti event, or `{seriesId}:{occDate}` for a virtual occurrence (resolved to the exception row for that `original_date`; `{ photos: [] }` when none exists); up to 12 approved image photos with an Immich asset |
| `GET media/{photoId}/{variant}?exp=&sig=` | none | Token-free proxy for the signed links; `variant` is `original` or `thumbnail` |
| `GET stats?month=YYYY-MM` | `events:read` | Monthly impact card numbers |
| `POST posted` | `social:write` | Upsert on (event id, channel, kind, buffer post id); optional `occurrenceDate` (YYYY-MM-DD) and `eventName` are stored and updated by a repeat; audited as `social.posted.record` with actor role `social-api` (target `teamEvent` only for a bare uuid, `teamEventSeries` with the series id for a composite id, otherwise `socialPost` without an id); 204 |
| `GET posted?eventId=` or `GET posted?from=&to=` | `social:write` or `events:read` | Exactly one form, else 400. `{ posted: PostedRecord[] }`, `occurrenceDate` and `eventName` null when unset. The window form (same validation as `events`) returns records whose `occurrence_date` is in the window, or whose `occurrence_date` is null and `event_id` is `<uuid>:<YYYY-MM-DD>` with the date in the window |
| `POST notify` | `social:write` | WhatsApp digest to the approver; 204 |
| `GET openapi.json` | none | `@pi-dash/shared/social-api-openapi` |

### Events

`getSocialEvents` (`packages/db/src/queries/social-api.ts`) loads the same standalone/parent/exception rows as the public feed, but in both cities, without clamping `from` to now, and including cancelled rows. Expansion is shared with the public feed through `expandEventOccurrences` in `@pi-dash/shared/public-events`; `buildSocialEvents` (`@pi-dash/shared/social-api`) maps occurrences:

- `id` is the row id for exceptions and standalone events and `{seriesId}:{occDate}` (`occDate` is the series' date key, as in `original_date`) for a virtual occurrence, so every week of a series has its own id (`virtualSocialEventId` / `parseVirtualSocialEventId`). Once an occurrence is materialised its id becomes the exception row id. `signUpUrl` keeps the register link (`interestEventId` = series id plus `occDate`).
- `status`: `cancelled` when the row or its series is cancelled, and for an occurrence the RRULE produces inside the window that the series' `recurrence_rule.exdates` removed (and no exception row replaced); `completed` when `social_completed_at` is set on a materialised row (a virtual occurrence never is); otherwise `scheduled`. Dates removed by `excludeRules` are part of the pattern and never appear.
- Limitation: "cancel this and following" truncates the RRULE by overwriting its `UNTIL`, so the occurrences it removed cannot be reconstructed and simply disappear from the feed (materialised exceptions after the split are cancelled rows and stay as `cancelled`). The pipeline treats an occurrence that vanished as dropped.
- `volunteers`: `needed` from `volunteers_needed`, falling back to the series parent; `approved` and `waitlisted` count `event_interest` rows (`approved`, `pending`) on the materialised row, the series parent for virtual occurrences.
- `partners` from `event_partner`: an exception row uses its own partners when it has any, otherwise the parent's.
- `attendance` (children, checked-in volunteers, session hours to one decimal), `photos.count` (usable photos: approved, Immich asset set, `mime_type` `image/*`, not `do_not_use`) and `socialNotes` stay null until `social_completed_at` is set. `photos.consentCleared` is always false until the consent process exists.
- `startTime`/`endTime` are `HH:mm` in India; `programme` is inferred from the team name, `"general"` when unknown; `venue.name` is the public area.

### Photos and signed links

The photos endpoint reads `event_photo` rows with status `approved`, `immich_asset_id` set and `mime_type` starting `image/` (the signed media proxy serves only those rows too). Usable photos rank first, then by `coalesce(taken_at, created_at)`; the cap of 12 applies after ranking, so `do_not_use` photos are still returned with the flag but never displace usable ones. Up to 60 candidates are read in that order, so later uploads are not starved by photos without a capture time. When `width` or `height` is null the asset is looked up once in Immich `GET /api/assets/{id}` (EXIF size, rotated orientations swapped; `dateTimeOriginal` then `fileCreatedAt`), at most 4 lookups at a time per request, and the result persisted; a size Immich does not know is stored as `0` ("unknown, checked") so the asset is not fetched again, and an unknown capture time falls back to the upload time.

Links are `/api/social/v1/media/{photoId}/{variant}?exp=<unix>&sig=<hex>`, where `sig = HMAC-SHA256(SOCIAL_MEDIA_SIGNING_SECRET, "{photoId}\n{variant}\n{exp}")` and `exp` is 36 hours ahead (`apps/web/src/lib/social-media-url.ts`). The proxy verifies with `timingSafeEqual`, streams `fetchImmichOriginal` / `fetchImmichThumbnail`, and sets `Cache-Control: private, max-age=3600`. Both photo endpoints return 503 when the secret or Immich is not configured.

### Stats

Sessions are `team_event` rows with `social_completed_at` set and `cancelled_at` null whose start falls in the India-time month (`summarizeSocialSessions` in `@pi-dash/shared/social-api`). `children` sums `children_attended`, `volunteers` counts distinct users marked present, `hours` sums session hours, `newOptimists` counts active users created in the month, `partners` are distinct partner names (with series inheritance) of public sessions only: private sessions count towards sessions, children, volunteers and hours, but their partners are never published. `allTime` computes active users, hours and children over every completed, non-cancelled row; app_config overrides replace each value when set to a non-negative number.

### Notify

Body `{ to: "approver", template: "social-digest", lines }` (1–40 lines, 500 characters each). The handler respects the notifications kill switch (204 without sending), resolves the approver, and enqueues one `send-whatsapp` job with text `Social digest` + blank line + the lines. The idempotency key (sha256 of the India date and body) is forwarded to the gateway, so the same digest on the same day sends once.

## app_config keys

| Key | Value |
|---|---|
| `social_approver_user_id` | User id whose phone receives the social digest; unset makes `notify` return 503 |
| `social_all_time_optimists` | Overrides `allTime.optimists` (historical total, e.g. `3600`) |
| `social_all_time_hours` | Overrides `allTime.hours` (e.g. `14000`) |
| `social_all_time_reached` | Overrides `allTime.reached` (e.g. `23000`) |

Set them in **Settings → General → Social posts** (`settings.app_config`): a picker of active, unbanned users for the approver, and three optional number fields for the all-time totals. Saving a value uses `appConfig.upsert`; clearing a field (or picking "None") uses `appConfig.remove`, so the API falls back to the computed figure or 503 for a missing approver.

## Dashboard UI

### Social recap (post-event form)

`apps/web/src/components/teams/events/event-social-recap.tsx`, rendered above the post-event tabs on the event detail page. It appears when the viewer can mark attendance (`events.manage_attendance` or team lead, so admins and the event's team leads), the event has ended and is not cancelled, and the page shows a single session row: a standalone event or an exception. A series parent never gets the card (the API expands it into virtual occurrences, which cannot be completed). A past **virtual** occurrence shows a "Start recap" button only when the viewer can materialise it (`teamEvent.materialize`: `events.edit` or lead) or when an exception row for that date already exists; the button opens the existing row, otherwise materialises the occurrence and navigates to the new row (`deriveSocialRecapMode` in `event-social-fields.ts`). Kalakriti-managed events never show it.

The card holds: children attended (required whole number), volunteers attended (read-only count of members marked present, with a hint to mark attendance in the Volunteers list), "What happened" (`social_notes`, at most 280 characters) and every approved photo with a "Do not use" switch. "Mark recap ready" saves the fields and stamps `social_completed_at`; the card then shows "Recap ready · date" with **Edit** (updates children and notes, keeps the original stamp) and **Undo** (clears `social_completed_at`, keeps the entered figures). Photo upload stays in the Photos tab.

### Event form

`event-form-dialog.tsx` has a "Volunteers and partners" block for non-Kalakriti events: "Volunteers needed" (optional whole number, at most 1000) and a partners repeater (`event-partners-field.tsx`; name required, Instagram handle and LinkedIn optional, at most 6). Values are written to the row the edit already targets: the event itself, the series parent for "all", the new or existing exception for "this", and the new series for "following" (`resolveSeriesWriteTarget`). Partners are replaced as a set with fresh ids on every save, so a new exception or split series never reuses the source row's ids. The edit form prefills what the row shows today, including what an exception inherits from its parent. For "this" and for edits of an exception, `buildSocialFields` (`event-social-fields.ts`) sends `partners` and `volunteersNeeded` only when they differ from that prefill, so unchanged values keep inheriting from the series; "all" and "following" always send both.

`teamEvent.create`, `materialize` and `updateSeries` ("this" and "following") refuse a client-supplied row id that already exists (Zero server inserts are `ON CONFLICT DO NOTHING`, so a colliding insert would be silent), and `replaceEventPartners` re-reads its target row and requires the team the caller was authorised against.

### Event detail display

The details card lists the effective partners (an exception's own, otherwise its parent's). For managers, quick stats add "Approved / needed" (approved `event_interest` rows against `volunteers_needed`, falling back to the parent) when a target is set. Only `teamEvent.byId` loads the `partners` relation.

### Mutators and permissions

| Mutator | Gate |
|---|---|
| `teamEvent.saveSocialRecap({ eventId, childrenAttended, socialNotes, markReady, now })` | `events.manage_attendance` or team lead; ended, non-series-parent, non-Kalakriti row; stamps `social_completed_at` only when unset |
| `teamEvent.undoSocialRecap({ eventId, now })` | same as above |
| `eventPhoto.setDoNotUse({ id, doNotUse })` | approved photos only; `events.manage_photos`, or `events.manage_attendance` / team lead |
| `teamEvent.create` / `update` / `updateSeries` with `volunteersNeeded`, `partners` | the existing `events.create` / `events.edit` or team lead gates |
| `appConfig.upsert` / `appConfig.remove` | `settings.app_config` |

All go through the central Zero mutation audit; `childrenAttended`, `socialNotes`, `markReady`, `doNotUse`, `partners` and `volunteersNeeded` are allowed as changed-field names (values are never stored). Shared limits live in `@pi-dash/shared/social-recap`.

## Data

- `team_event`: `volunteers_needed` (event form), `children_attended`, `social_notes`, `social_completed_at` (social recap card).
- `event_partner`: partner name and optional Instagram handle and LinkedIn slug per event row; exposed to Zero as `teamEvent.partners`.
- `event_photo`: `do_not_use`, `width`, `height`, `taken_at`.
- `social_post`: the posted log; `event_id` is the social API event id as the generator sent it (never rewritten when an occurrence is materialised), so not a foreign key; `occurrence_date` (indexed) and `event_name` are set for event posts.
