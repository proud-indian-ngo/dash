# Social API

> **Load when**: `/api/social/v1`, social-artifacts pipeline, `social_api_token`, `social:token`, `requireSocialToken`, `social_post`, `social_run`, `event_partner`, post-event social fields (`children_attended`, `social_notes`, `social_completed_at`, `volunteers_needed`), signed photo links, `SOCIAL_MEDIA_SIGNING_SECRET`, social digest, `social_paused`, `social_rules`, `social.manage`, Social page (`/social`), `socialPost.drop`.
> **Related**: `recurring-events.md`, `file-uploads.md`, `notifications.md`, `caching.md`

Machine-facing API for the social-artifacts generator (Instagram and LinkedIn posts). The contract is `social-artifacts/docs/strategy/dashboard-api-spec.md`; the consumer's typed client (`social-artifacts/worker/src/pipeline/dashboard.ts`) is the source of truth for response shapes. No browser consumer, so no CORS.

## Bearer tokens

- `Authorization: Bearer <token>`, one token per consumer. `social_api_token` stores the sha256 hex of the token, `scopes` (`events:read`, `photos:read`, `signups:read`, `social:write`), `last_used_at` and `revoked_at`. It is kept out of the schema barrel so it never reaches Zero.
- `requireSocialToken(request, scope)` (`apps/web/src/lib/social-api-auth.ts`) looks the token up by hash (so no constant-time compare is needed), checks the scope (a list means any of), and touches `last_used_at` fire-and-forget. Missing, unknown or revoked: 401. Missing scope: 403. Both `Cache-Control: no-store`.
- `authorizeSocialRequest` adds the in-process rate limit: 600 requests a minute per token and endpoint (see `caching.md`).
- Manage tokens in Settings → API Tokens (`settings.app_config`) through server functions in `apps/web/src/functions/social-api-tokens.ts`. The raw token is shown once. Create and revoke are audited as `socialApiToken.create` and `socialApiToken.revoke`, never with the token or name.
- CLI fallback: `bun run social:token create <name> --scopes …`, `list`, `revoke <id>`.
- `scripts/seed.ts` inserts a fixed dev token, skipped in production (`scripts/seed-social-token.ts`).

## Endpoints

Routes live in `apps/web/src/routes/api/social/v1/`, handlers with injectable dependencies in `apps/web/src/lib/social-api/`. Other methods get 405. `POST` bodies over 64 KB get 413 (`readJsonBody`, checked by `Content-Length` and by actual size).

| Endpoint | Scope | Returns |
|---|---|---|
| `GET events?from=&to=` | `events:read` | `{ timezone: "Asia/Kolkata", events }` |
| `GET events/{id}/photos` | `photos:read` | Up to 12 photos with signed links |
| `GET media/{photoId}/{variant}?exp=&sig=` | none (signed) | Image bytes; `variant` is `original` or `thumbnail` |
| `GET stats?month=YYYY-MM` | `events:read` | Monthly impact numbers |
| `POST posted` | `social:write` | 204 |
| `GET posted?eventId=` or `?from=&to=` | `social:write` or `events:read` | `{ posted }` |
| `POST notify` | `social:write` | 204 |
| `GET settings` | `events:read` | `{ paused, pausedKinds, rules }`, `no-store` |
| `POST runs` | `social:write` | 204 |
| `GET openapi.json` | none | `@pi-dash/shared/social-api-openapi` |

### Events

`from` and `to` are India dates, inclusive, at most 120 days counting both ends; `from` may be in the past. Impossible dates are a 400.

`getSocialEvents` (`packages/db/src/queries/social-api.ts`) loads the same rows as the public feed, in every active cost centre, without clamping `from` to now and including cancelled rows. Both share `expandEventOccurrences` (`@pi-dash/shared/public-events`); `buildSocialEvents` (`@pi-dash/shared/social-api`) maps occurrences.

- `id` is the row id for standalone events and exceptions, and `{seriesId}:{occDate}` for a virtual occurrence (`virtualSocialEventId`, `parseVirtualSocialEventId`). Once materialised, the occurrence's id becomes the exception row id.
- `status` is `cancelled` when the row or series is cancelled or the occurrence is in `recurrence_rule.exdates` with no replacing exception; `completed` when `social_completed_at` is set (never on a virtual occurrence); otherwise `scheduled`. `excludeRules` dates never appear.
- "Cancel this and following" overwrites the RRULE's `UNTIL`, so the removed occurrences vanish from the feed. The pipeline treats a vanished occurrence as dropped.
- `volunteers.needed` comes from `volunteers_needed`, falling back to the series parent. `approved` and `waitlisted` count `approved` and `pending` `event_interest` rows on the materialised row, or the parent for virtual occurrences.
- `city` and `cityName` are the cost centre's code and name, with the area label built as in the public feed (`recurring-events.md`).
- `partners` come from `event_partner`: an exception's own if it has any, otherwise the parent's.
- `attendance` (children, checked-in volunteers, hours to one decimal), `photos.count` and `socialNotes` stay null until `social_completed_at` is set. `photos.consentCleared` is always false until a consent process exists.

### Photos and signed links

- A `{seriesId}:{occDate}` id resolves to the exception row for that date; with none, `{ photos: [] }`.
- Photos must be `approved`, have `immich_asset_id`, and have an `image/*` MIME type; the media proxy serves only those rows. Usable photos rank first, then by `coalesce(taken_at, created_at)`. The cap of 12 applies after ranking, so `do_not_use` photos come back flagged but never displace usable ones. Up to 60 candidates are read.
- Missing `width`, `height` or `taken_at` is fetched once from Immich `GET /api/assets/{id}` (at most 4 at a time) and stored. An unknown size is stored as `0` so it is not fetched again.
- Links are `/api/social/v1/media/{photoId}/{variant}?exp=<unix>&sig=<hex>`, with `sig = HMAC-SHA256(SOCIAL_MEDIA_SIGNING_SECRET, "{photoId}\n{variant}\n{exp}")` and `exp` 36 hours ahead (`apps/web/src/lib/social-media-url.ts`). The proxy verifies with `timingSafeEqual`, streams from Immich and sets `Cache-Control: private, max-age=3600`.
- The listing returns 503 only when the secret is missing. Without Immich it still lists photos but skips the size backfill, and the proxy returns 503.

### Stats

Sessions are `team_event` rows with `social_completed_at` set and not cancelled, starting in the India-time month (`summarizeSocialSessions`).

- `children` sums `children_attended`; `volunteers` counts distinct users marked present; `hours` sums session hours; `newOptimists` counts active users created in the month.
- `partners` lists distinct partner names of public sessions only. Private sessions count towards every other figure, but their partners are never published.
- `allTime` covers active users, hours and children over all completed, non-cancelled rows. The `social_all_time_*` app_config values replace each figure when set to a non-negative number.

### Posted log

- `POST posted` upserts on (event id, channel, kind, Buffer post id). Optional `occurrenceDate`, `eventName` and `held` (`true` = Buffer draft for approval, `false` = scheduled) are stored; a repeat without `held` keeps the stored value.
- It is audited as `social.posted.record` with actor role `social-api`. The target is `teamEvent` for a bare uuid, `teamEventSeries` for a composite id, otherwise `socialPost` without an id.
- `GET posted` takes exactly one of `eventId` or `from`/`to` (same validation as events), else 400. The window form returns records whose `occurrence_date` is in the window, or whose `occurrence_date` is null and whose composite `event_id` date is in the window.

### Social digest

`POST notify` takes `{ to: "approver", template: "social-digest", lines }` (1–40 lines, 500 characters each).

- With the notifications kill switch on, it returns 204 without sending.
- It sends to the user in app_config `social_approver_user_id`; with no approver or phone, 503. The pipeline never stores phone numbers.
- It enqueues one `send-whatsapp` job with the text `Social digest` + blank line + lines, and the `social_digest` template with a summary of about 280 characters ("N items: first; second and K more", whole lines only, each cut to about 100).
- The idempotency key is sha256 of the India date and body, so the same digest sends once a day.

### Settings: pause switches and posting rules

The generator reads `GET settings` at the start of every run. Parsing lives in `buildSocialSettings` (`@pi-dash/shared/social-api`).

- `paused` is true only when `social_paused` is exactly `"true"`. The hourly run then does nothing.
- `pausedKinds` lists the kinds in `social_paused_kinds` (comma-separated; unknown values ignored; order `schedule`, `recap`, `volunteer-call`, `impact`, `story`). The run skips those kinds.
- A pause does not touch posts already in Buffer. Drop them on the Social page and delete them in Buffer.

`rules` carries posting rules the pipeline merges over its own defaults. Every field is optional; an absent field means the pipeline default. Shape (`socialRulesSchema`, strict):

```
rules = {
  schedule:      { buildTime, postTime, minRows, maxRows, held, title },
  story:         { held },
  recap:         { postTime, lookbackDays, slideshowMinPhotos, photosMax, reelMinSeconds, held, closingLine },
  volunteerCall: { postTime, daysOut, held },
  impact:        { buildTime, postTime, postDaysAfterBuild, held, line }
}
```

- Times are IST `"HH:MM"`. `minRows` and `maxRows` 1–6, `lookbackDays` 0–14, `slideshowMinPhotos` and `photosMax` 1–12, `reelMinSeconds` 5–60, `daysOut` 1–14, `postDaysAfterBuild` 0–6. `held` sends posts to Buffer drafts for the approver. `title`, `closingLine` and `line` are 1–120 characters on one line, with no control characters.
- Cross-field checks use the default for an unset side and report on the field named last:
  - schedule: `minRows ≤ maxRows`, `buildTime < postTime`, and the window `[buildTime, postTime)` must contain an HH:00 instant, because the Worker's cron runs hourly (`hasHourMarkBetween`)
  - recap: `photosMax ≥ slideshowMinPhotos`; recaps without cleared photo consent stay held regardless
  - impact: `postDaysAfterBuild > 0` or `postTime > buildTime`
- Stored as JSON in app_config `social_rules`. A missing key, bad JSON or a schema failure all give `rules: {}`; the last two log `social_rules_invalid`, never a 500.
- `SOCIAL_RULES_DEFAULTS` is a display copy of the Worker's defaults, which the Worker owns. The OpenAPI `rules` schema is generated from `socialRulesSchema` with these as defaults.

### Run reports

`POST runs` takes `{ startedAt, finishedAt, tick: "hourly" | "digest", eventsSeen, planned, rendered, recorded, dropped, skipped, errors, digestSent }` (strict; counts non-negative; `finishedAt` not before `startedAt`).

- `skipped` and `errors` are refused beyond 1,000 entries or 10,000 characters an entry; otherwise the first 50 are kept, each cut to 500 characters.
- `insertSocialRun` inserts into `social_run` and, in the same transaction, keeps only the latest 500 rows.
- Not audited: it is the pipeline's own telemetry, like a scheduled job (classified in `audit-entrypoint-coverage.test.ts`).

## app_config keys

| Key | Value |
|---|---|
| `social_approver_user_id` | User whose phone gets the social digest; unset makes `notify` return 503 |
| `social_all_time_optimists`, `social_all_time_hours`, `social_all_time_reached` | Override the computed all-time figures |
| `social_paused` | `"true"` pauses the pipeline |
| `social_paused_kinds` | Comma-separated kinds to skip |
| `social_rules` | JSON posting rules; unset means every default |

`appConfig.upsert` and `appConfig.remove` accept these seven keys (`SOCIAL_MANAGE_CONFIG_KEYS`) from `social.manage` holders (`assertCanWriteAppConfig`); `settings.app_config` may write any key. Clearing a field removes its key, so the API falls back to the computed figure, no paused kinds or 503.

## Social page

`/social` (`apps/web/src/routes/_app/social.tsx`, components in `apps/web/src/components/social/`) needs `social.manage`, in `beforeLoad` and for the sidebar link. `social.manage` is granted to `super_admin` and `admin`, not `finance_admin`. Tabs, by `?tab=`:

- Runs (default): `socialRun.all`, with skipped reasons and errors expandable.
- Posts: `socialPost.all`, with a Drop post action on queued and approved rows.
- Settings: pause switches (overall and per kind; `story` is reserved), posting rules, the approver and the all-time totals.

Both Zero queries return nothing without `social.manage`; `social_run` has no mutators. Names come from the `getSocialPeople` server function (`apps/web/src/functions/social-people.ts`, `social.manage` or `users.view`), which returns ids and names only, never from synced user rows. Zero 1.9 has no column projection, so `socialPost.all` has no user relation.

The posting rules form (`social-rules.tsx`, `social-rules-form.ts`) validates with `socialRulesSchema` and stores only fields that differ from the defaults; saving nothing or "Reset to defaults" removes `social_rules`. It seeds once, and a synced change from another admin re-seeds it only when there are no unsaved edits.

### Dropping a post

`socialPost.drop` (`social.manage`) works on `queued` or `approved` posts. It sets `status = "dropped"`, `dropped_by` and `dropped_at`. The generator treats `dropped` as final, and `upsertSocialPost` keeps a dropped row dropped when `POST posted` repeats `queued` or `approved`. A repeat reporting `published` wins, because the post went out anyway. Dropping does not delete the Buffer post; the confirmation says to delete it there.

## Event-side fields

### Social recap card

`apps/web/src/components/teams/events/event-social-recap.tsx`, above the post-event tabs on the event page.

- Shown on ended, non-cancelled, non-Kalakriti single session rows (standalone or exception) to people who can mark attendance. A series parent never shows it; a past virtual occurrence offers "Start recap", which opens or materialises the row (`deriveSocialRecapMode`).
- It records children attended, "What happened" (`social_notes`, 280 characters) and a "Do not use" switch per approved photo.
- "Mark recap ready" stamps `social_completed_at`. Edit keeps the stamp; Undo clears it and keeps the figures.

### Event form

`event-form-dialog.tsx` sets "Volunteers needed" (up to 1000) and up to 6 partners for non-Kalakriti events.

- Values go to the row the edit targets (`resolveSeriesWriteTarget`): the event, the series parent for "all", the exception for "this", the new series for "following".
- Partners are replaced as a set with fresh ids each save, so a new exception or split series never reuses the source's ids.
- For "this" and exception edits, `buildSocialFields` sends `partners` and `volunteersNeeded` only when they differ from the prefill, so unchanged values keep inheriting. "All" and "following" always send both.
- `teamEvent.create`, `materialize` and `updateSeries` refuse a client row id that already exists, because Zero server inserts are `ON CONFLICT DO NOTHING` and a collision would be silent. `replaceEventPartners` re-reads its target and requires the authorised team.

Only `teamEvent.byId` loads `partners`.

### Mutators

| Mutator | Gate |
|---|---|
| `teamEvent.saveSocialRecap`, `teamEvent.undoSocialRecap` | `events.manage_attendance` or team lead; ended, non-series-parent, non-Kalakriti row. Save stamps `social_completed_at` only when unset |
| `eventPhoto.setDoNotUse` | approved photos; `events.manage_photos`, `events.manage_attendance` or team lead |
| `teamEvent.create` / `update` / `updateSeries` with `volunteersNeeded`, `partners` | existing event create and edit gates |
| `appConfig.upsert` / `remove` | `settings.app_config`, or `social.manage` for the social keys |
| `socialPost.drop` | `social.manage` |

All pass through the central Zero mutation audit with field names only. Shared limits live in `@pi-dash/shared/social-recap`.

## Data

- `team_event`: `volunteers_needed`, `children_attended`, `social_notes`, `social_completed_at`.
- `event_partner`: name, optional Instagram handle and LinkedIn slug per event row (`teamEvent.partners` in Zero).
- `event_photo`: `do_not_use`, `width`, `height`, `taken_at`.
- `social_post`: the posted log. `event_id` is the API id as sent and is never rewritten on materialisation, so it is not a foreign key. Also `occurrence_date` (indexed), `event_name`, nullable `held`, `dropped_by` (set null on user delete), `dropped_at`.
- `social_run`: run reports, at most 500 rows; `skipped` and `errors` are jsonb string arrays. Read-only in Zero.
