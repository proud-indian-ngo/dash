# Social API

> **Load when**: `/api/social/v1`, social-artifacts pipeline, `social_api_token`, `social:token`, `requireSocialToken`, `social_post`, `event_partner`, post-event social form fields (`children_attended`, `social_notes`, `social_completed_at`, `volunteers_needed`), signed photo links, `SOCIAL_MEDIA_SIGNING_SECRET`, `social_approver_user_id`, social digest, `social_run`, `social_paused`, `social.manage`, Social page (`/social`), `socialPost.drop`.
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
| `GET settings` | `events:read` | `{ paused, pausedKinds, rules }` from app_config `social_paused`, `social_paused_kinds` and `social_rules` (see [Pause](#pause) and [Posting rules](#posting-rules)); `Cache-Control: no-store` |
| `POST runs` | `social:write` | One pipeline run report (see [Runs](#runs)); 204 |
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

### Request bodies

`POST runs`, `posted` and `notify` read their JSON through `readJsonBody` (`lib/social-api/shared.ts`), which refuses bodies over 64 KB with 413: by `Content-Length` before reading, and by the actual size when the header is missing or wrong.

### Photos and signed links

The photos endpoint reads `event_photo` rows with status `approved`, `immich_asset_id` set and `mime_type` starting `image/` (the signed media proxy serves only those rows too). Usable photos rank first, then by `coalesce(taken_at, created_at)`; the cap of 12 applies after ranking, so `do_not_use` photos are still returned with the flag but never displace usable ones. Up to 60 candidates are read in that order, so later uploads are not starved by photos without a capture time. When `width` or `height` is null the asset is looked up once in Immich `GET /api/assets/{id}` (EXIF size, rotated orientations swapped; `dateTimeOriginal` then `fileCreatedAt`), at most 4 lookups at a time per request, and the result persisted; a size Immich does not know is stored as `0` ("unknown, checked") so the asset is not fetched again, and an unknown capture time falls back to the upload time.

Links are `/api/social/v1/media/{photoId}/{variant}?exp=<unix>&sig=<hex>`, where `sig = HMAC-SHA256(SOCIAL_MEDIA_SIGNING_SECRET, "{photoId}\n{variant}\n{exp}")` and `exp` is 36 hours ahead (`apps/web/src/lib/social-media-url.ts`). The proxy verifies with `timingSafeEqual`, streams `fetchImmichOriginal` / `fetchImmichThumbnail`, and sets `Cache-Control: private, max-age=3600`. The listing returns 503 only when the secret is missing; without Immich it still lists photos but skips the metadata backfill, and the media proxy returns 503 when a link is fetched.

### Stats

Sessions are `team_event` rows with `social_completed_at` set and `cancelled_at` null whose start falls in the India-time month (`summarizeSocialSessions` in `@pi-dash/shared/social-api`). `children` sums `children_attended`, `volunteers` counts distinct users marked present, `hours` sums session hours, `newOptimists` counts active users created in the month, `partners` are distinct partner names (with series inheritance) of public sessions only: private sessions count towards sessions, children, volunteers and hours, but their partners are never published. `allTime` computes active users, hours and children over every completed, non-cancelled row; app_config overrides replace each value when set to a non-negative number.

### Pause

`GET settings` is read by the generator at the start of every run. `paused` is true only when `social_paused` is exactly `"true"`; then the hourly run does nothing (no planning, rendering, recording or Buffer queueing). `pausedKinds` lists the kinds in `social_paused_kinds` (comma-separated; unknown values are ignored, order is `schedule`, `recap`, `volunteer-call`, `impact`, `story`) and the run skips posts of those kinds. Posts already queued in Buffer are not touched by a pause; drop them (below) and delete them in Buffer. Parsing lives in `buildSocialSettings` / `parseSocialPausedKinds` (`@pi-dash/shared/social-api`).

### Posting rules

`rules` in `GET settings` carries the posting rules the pipeline merges over its own defaults. Every field is optional; an absent field (or kind) means the pipeline default, so the dashboard stores only what an admin set. Shape (`socialRulesSchema`, strict at both levels):

```
rules = {
  schedule:      { buildTime, postTime, minRows, maxRows, held, title },
  story:         { held },
  recap:         { postTime, lookbackDays, slideshowMinPhotos, photosMax, reelMinSeconds, held, closingLine },
  volunteerCall: { postTime, daysOut, held },
  impact:        { buildTime, postTime, postDaysAfterBuild, held, line }
}
```

Times are IST `"HH:MM"` strings (24-hour, any minute). `minRows` / `maxRows` are integers 1–6, `lookbackDays` 0–14, `slideshowMinPhotos` and `photosMax` 1–12, `reelMinSeconds` 5–60, `daysOut` 0–14, `postDaysAfterBuild` 0–6; `held` is a boolean (held posts land in Buffer drafts for the approver); `title`, `closingLine` and `line` are trimmed strings of 1–120 characters. Cross-field checks use the default for the side that is unset: `minRows ≤ maxRows` and `photosMax ≥ slideshowMinPhotos`. The value is stored as JSON in app_config `social_rules` (`SOCIAL_RULES_CONFIG_KEY`). `buildSocialSettings` parses it with `parseSocialRules`; a missing key gives `rules: {}`, and bad JSON or a value outside the schema also gives `rules: {}` while the settings handler logs a `social_rules_invalid` warning, never a 500.

`SOCIAL_RULES_DEFAULTS` is a display copy of the pipeline's defaults (the Worker owns them): schedule build 09:00, post 19:00, 3–6 rows, not held, title "This week with Proud Indian"; story not held; recap post 20:00, look back 3 days, slideshow from 3 photos, at most 12 photos, reels from 15 s, held, closing line "Thank you for showing up"; volunteer call post 19:00, 4 days before the session, not held; impact build 09:00, post 09:00, 2 days after the build, held, line "Thank you to every Optimist and partner who showed up.". The OpenAPI `SocialSettings.rules` schema is generated from `socialRulesSchema` (`z.toJSONSchema`) with these defaults as `default`.

### Runs

`POST runs` takes `{ startedAt, finishedAt, tick: "hourly" | "digest", eventsSeen, planned, rendered, recorded, dropped, skipped, errors, digestSent }` (strict; counts are non-negative integers, `finishedAt` may not precede `startedAt`). `skipped` and `errors` are refused beyond 1,000 entries or 10,000 characters an entry, and otherwise capped: the first 50 entries are kept, each cut to 500 characters. `insertSocialRun` (`packages/db/src/queries/social-api.ts`) inserts the row into `social_run` and, in the same transaction, deletes everything but the latest 500 rows (by uuidv7 id). The route is not audited: like a scheduled job, it is the pipeline's own telemetry (classified in `audit-entrypoint-coverage.test.ts`).

### Drop

Holders of `social.manage` can drop a `queued` or `approved` post on the Social page (`socialPost.drop`). The row gets `status = "dropped"`, `dropped_by` (the user) and `dropped_at`. The generator treats `dropped` as final, and `upsertSocialPost` keeps a dropped row dropped when `POST posted` repeats it with `queued` or `approved` (the other fields still update). A repeat reporting `published` wins, because the post went out anyway (for example it was already in Buffer); `dropped_by` and `dropped_at` stay on the row as history. Dropping does not delete the Buffer post; the confirmation tells the user to delete it there.

### Notify

Body `{ to: "approver", template: "social-digest", lines }` (1–40 lines, 500 characters each). The handler respects the notifications kill switch (204 without sending), resolves the approver, and enqueues one `send-whatsapp` job with text `Social digest` + blank line + the lines. The idempotency key (sha256 of the India date and body) is forwarded to the gateway, so the same digest on the same day sends once.

## app_config keys

| Key | Value |
|---|---|
| `social_approver_user_id` | User id whose phone receives the social digest; unset makes `notify` return 503 |
| `social_all_time_optimists` | Overrides `allTime.optimists` (historical total, e.g. `3600`) |
| `social_all_time_hours` | Overrides `allTime.hours` (e.g. `14000`) |
| `social_all_time_reached` | Overrides `allTime.reached` (e.g. `23000`) |
| `social_paused` | `"true"` pauses the whole pipeline; `"false"` or unset runs it |
| `social_paused_kinds` | Comma-separated kinds the run skips (e.g. `recap,impact`); unset when none |
| `social_rules` | JSON posting rules (see [Posting rules](#posting-rules)); unset means every pipeline default |

Set them on the **Social page → Settings** tab (`social.manage`): "Pause all posts", one "Pause … posts" switch per kind (`schedule`, `recap`, `volunteer-call`, `impact`; `story` is reserved and kept if already listed), a "Posting rules" form below the switches, a picker of active, unbanned users for the approver, and three optional number fields for the all-time totals. Saving a value uses `appConfig.upsert`; clearing a field (or picking "None", or unpausing the last kind) uses `appConfig.remove`, so the API falls back to the computed figure, no paused kinds, or 503 for a missing approver. The posting rules form (`social-rules.tsx`, helpers in `social-rules-form.ts`) has one card per kind (Weekly schedule, Schedule story, Recap, Volunteer call, LinkedIn impact): an empty text field per rule with the default as placeholder and help text, and a "Hold … for approval" switch showing the effective value. "Save rules" validates with `socialRulesSchema` (errors show under each field), leaves out empty fields and switches left at their default, and upserts the JSON; saving with nothing set removes the key. "Reset to defaults" (behind a confirmation) removes `social_rules`. A stored value the schema rejects shows a warning and an empty form. `appConfig.upsert` / `remove` accept these seven keys (`SOCIAL_MANAGE_CONFIG_KEYS` in `@pi-dash/shared/social-api`) from `social.manage`; every other key still needs `settings.app_config`, which may write all keys. API tokens stay in **Settings → API Tokens** (`settings.app_config`).

## Dashboard UI

### Social page

`/social` (`apps/web/src/routes/_app/social.tsx`, components in `apps/web/src/components/social/`), guarded by `social.manage` in `beforeLoad` and listed in the sidebar's Organization group after Events only with that permission. `social.manage` ("Manage social posts: pause the pipeline, drop queued posts, change social settings") is granted to `super_admin` and `admin` by `syncPermissions`; `finance_admin` is excluded. Three tabs, selected by `?tab=`:

- **Runs** (default): `socialRun.all`, newest first by `started_at`: time (IST), tick, events seen, planned, rendered, recorded, dropped, digest sent and a result badge (OK or the error count). Rows with skipped reasons or errors expand to list them. With no runs, an empty state explains the hourly and daily digest runs.
- **Posts**: `socialPost.all`, newest first by `scheduled_for`: scheduled for (IST), kind, channel, event (name and occurrence date; a link to `/events/$id` when the event id is a bare uuid), status badge (dropped rows add who and when), Buffer id. Status, kind and channel filters, with status as view tabs. Queued and approved rows have a **Drop post** row action behind a confirmation.
- **Settings**: the pause switches, the posting rules, the digest approver and the all-time totals (see [app_config keys](#app_config-keys)).

Both Zero queries return nothing without `social.manage`; `social_run` has no mutators. User names never come from synced user rows: the approver picker and the "dropped by" names use the `getSocialPeople` server function (`apps/web/src/functions/social-people.ts`, loader in `apps/web/src/lib/social-people.ts`, `social.manage` or `users.view`), which returns ids and names only: active, unbanned, non-external users as approver candidates, plus the named ids (the current approver) and everyone who dropped a post. Zero 1.9 has no column projection, so `socialPost.all` has no user relation.

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
| `appConfig.upsert` / `appConfig.remove` | `settings.app_config` for any key; `social.manage` for the seven social keys only (`assertCanWriteAppConfig`) |
| `socialPost.drop({ id, now })` | `social.manage`; `queued` or `approved` posts only; stamps `dropped_by` / `dropped_at` |

All go through the central Zero mutation audit; `childrenAttended`, `socialNotes`, `markReady`, `doNotUse`, `partners` and `volunteersNeeded` are allowed as changed-field names (values are never stored). Shared limits live in `@pi-dash/shared/social-recap`.

## Data

- `team_event`: `volunteers_needed` (event form), `children_attended`, `social_notes`, `social_completed_at` (social recap card).
- `event_partner`: partner name and optional Instagram handle and LinkedIn slug per event row; exposed to Zero as `teamEvent.partners`.
- `event_photo`: `do_not_use`, `width`, `height`, `taken_at`.
- `social_post`: the posted log; `event_id` is the social API event id as the generator sent it (never rewritten when an occurrence is materialised), so not a foreign key; `occurrence_date` (indexed) and `event_name` are set for event posts; `dropped_by` (user, set null on delete) and `dropped_at` are set by `socialPost.drop`; names resolve through `getSocialPeople`.
- `social_run`: pipeline run reports (`POST runs`), at most 500 rows; `skipped` and `errors` are jsonb string arrays. In Zero, read-only.
