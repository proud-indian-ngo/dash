# Social API

> **Load when**: `/api/social/v1`, the social-artifacts pipeline, `social_api_token`, `requireSocialToken`, `social_post`, `social_run`, `event_partner`, post-event social fields, signed photo links, social digest, `social_paused`, `social_rules`, `social.manage`, the Social page.
> **Related**: `recurring-events.md`, `file-uploads.md`, `notifications.md`, `caching.md`

Machine-facing API for the social-artifacts generator (Instagram and LinkedIn posts). The contract is `social-artifacts/docs/strategy/dashboard-api-spec.md`; the consumer's typed client (`social-artifacts/worker/src/pipeline/dashboard.ts`) is the source of truth for response shapes. No browser consumer, so no CORS.

## Bearer tokens

- `Authorization: Bearer <token>`, one token per consumer. `social_api_token` stores only the sha256 of the token and is kept out of the schema barrel so it never reaches Zero.
- `requireSocialToken(request, scope)` looks the token up by hash, so no constant-time compare is needed. Missing, unknown or revoked: 401. Missing scope: 403.
- `authorizeSocialRequest` adds the per-token, per-endpoint rate limit (`caching.md`).
- Manage tokens in Settings → API Tokens (`settings.app_config`). The raw token is shown once. Create and revoke are audited, never with the token or name.
- CLI fallback: `bun run social:token`. The seed inserts a fixed dev token, skipped in production.

## Endpoints

Routes live in `apps/web/src/routes/api/social/v1/`, handlers in `apps/web/src/lib/social-api/`.

| Endpoint | Scope | Purpose |
|---|---|---|
| `GET events` | `events:read` | Events in an India-date window, including cancelled ones |
| `GET events/{id}/photos` | `photos:read` | Approved photos with signed links |
| `GET media/{photoId}/{variant}` | none (signed) | Image bytes |
| `GET stats` | `events:read` | Monthly impact numbers |
| `POST posted` | `social:write` | Record a post |
| `GET posted` | `social:write` or `events:read` | Posted log |
| `POST notify` | `social:write` | Social digest to the approver |
| `GET settings` | `events:read` | Pause switches and posting rules |
| `POST runs` | `social:write` | Run report |
| `GET openapi.json` | none | OpenAPI spec |

### Events

`getSocialEvents` loads the same rows as the public feed, via the shared `expandEventOccurrences`, but does not clamp `from` to now and keeps cancelled rows.

- A virtual occurrence's id is `{seriesId}:{occDate}`. Once materialised, its id becomes the exception row id.
- "Cancel this and following" overwrites the RRULE's `UNTIL`, so the removed occurrences vanish from the feed. The pipeline treats a vanished occurrence as dropped.
- Attendance, photo count and notes stay null until `social_completed_at` is set. `photos.consentCleared` is always false until a consent process exists.

### Photos and signed links

- Only approved image photos with an Immich asset are listed or served. The cap applies after ranking, so `do_not_use` photos come back flagged but never displace usable ones.
- Missing size or capture time is fetched once from Immich and stored. An unknown size is stored as `0` so it is not fetched again.
- Links are signed with `SOCIAL_MEDIA_SIGNING_SECRET` and expire after 36 hours (`apps/web/src/lib/social-media-url.ts`). The proxy streams from Immich.

### Stats

- Sessions are completed, non-cancelled `team_event` rows.
- `partners` lists partners of public sessions only. Private sessions count towards every other figure, but their partners are never published.
- The `social_all_time_*` app_config values replace each all-time figure when set.

### Posted log

- `POST posted` is audited as `social.posted.record` with actor role `social-api`.
- `GET posted` takes exactly one of `eventId` or a date window.

### Social digest

- With the notifications kill switch on, `POST notify` returns 204 without sending.
- It sends to the user in `social_approver_user_id`; with no approver or phone, 503. The pipeline never stores phone numbers.
- It sends the `social_digest` WhatsApp template. The idempotency key covers the India date and body, so the same digest sends once a day.

### Settings: pause switches and posting rules

The generator reads `GET settings` at the start of every run.

- `paused` is true only when `social_paused` is exactly `"true"`. `social_paused_kinds` skips individual kinds.
- A pause does not touch posts already in Buffer. Drop them on the Social page and delete them in Buffer.
- `rules` are merged over the pipeline's own defaults; an absent field means the pipeline default. `socialRulesSchema` defines the fields, limits and cross-field checks.
- The schedule window `[buildTime, postTime)` must contain an HH:00 instant, because the Worker's cron runs hourly.
- A missing key, bad JSON or a schema failure all give `rules: {}`, never a 500.
- `SOCIAL_RULES_DEFAULTS` is a display copy of the Worker's defaults, which the Worker owns.

### Run reports

`POST runs` stores the pipeline's telemetry in `social_run`, keeping the latest 500 rows. It is not audited, like a scheduled job.

## app_config keys

The social keys (`SOCIAL_MANAGE_CONFIG_KEYS`) are the approver, the all-time overrides, the pause switches and `social_rules`. `social.manage` holders may write only these; `settings.app_config` may write any key. Clearing a field removes its key, so the API falls back to its default.

## Social page

`/social` needs `social.manage`, granted to `super_admin` and `admin` but not `finance_admin`.

- Its Zero queries return nothing without `social.manage`; `social_run` has no mutators.
- Names come from the `getSocialPeople` server function, never from synced user rows. Zero has no column projection, so `socialPost.all` has no user relation.
- The posting rules form stores only fields that differ from the defaults.

### Dropping a post

`socialPost.drop` marks a queued or approved post `dropped`. The generator treats `dropped` as final, and a repeat `POST posted` with `queued` or `approved` keeps it dropped. A repeat reporting `published` wins, because the post went out anyway. Dropping does not delete the Buffer post.

## Event-side fields

### Social recap card

- Shown on ended, non-cancelled, non-Kalakriti single session rows to people who can mark attendance. A past virtual occurrence offers "Start recap", which materialises the row.
- "Mark recap ready" stamps `social_completed_at`. Undo clears it and keeps the figures.

### Event form

- Volunteers needed and partners go to the row the edit targets (`resolveSeriesWriteTarget`).
- Partners are replaced as a set with fresh ids each save, so a new exception or split series never reuses the source's ids.
- For "this" and exception edits, these fields are sent only when changed, so unchanged values keep inheriting.
- `teamEvent.create`, `materialize` and `updateSeries` refuse a client row id that already exists, because Zero server inserts are `ON CONFLICT DO NOTHING` and a collision would be silent.

### Mutators

| Mutator | Gate |
|---|---|
| `teamEvent.saveSocialRecap`, `teamEvent.undoSocialRecap` | `events.manage_attendance` or team lead |
| `eventPhoto.setDoNotUse` | `events.manage_photos`, `events.manage_attendance` or team lead |
| `appConfig.upsert` / `remove` | `settings.app_config`, or `social.manage` for the social keys |
| `socialPost.drop` | `social.manage` |

## Data

- `social_post.event_id` is the API id as sent and is never rewritten on materialisation, so it is not a foreign key.
