import { z } from "zod";

import {
  SOCIAL_EVENTS_MAX_DAYS,
  SOCIAL_NOTIFY_MAX_LINE_LENGTH,
  SOCIAL_NOTIFY_MAX_LINES,
  SOCIAL_PHOTOS_MAX,
  SOCIAL_RUN_MAX_MESSAGE_LENGTH,
  SOCIAL_RUN_MAX_MESSAGES,
  SOCIAL_RULES_DEFAULTS,
  SOCIAL_RUN_RETENTION,
  SOCIAL_TIMEZONE,
  type SocialEvent,
  type SocialMonthlyStats,
  type SocialPhoto,
  socialEventStatusValues,
  socialPostKinds,
  socialRulesSchema,
  socialRunTickValues,
  type SocialSettingsResponse,
} from "./social-api";

/**
 * OpenAPI 3.1 description of the bearer-token social API (`/api/social/v1/*`),
 * served at `/api/social/v1/openapi.json`. The `Record<keyof …>` types make a
 * field added to or removed from a response type fail type checking until the
 * schema matches.
 */

interface SchemaObject {
  [key: string]: unknown;
  description?: string;
  type?: string | string[];
}

const nullable = (schema: SchemaObject): SchemaObject => ({
  anyOf: [schema, { type: "null" }],
});

const count: SchemaObject = { minimum: 0, type: "integer" };
const hhmm: SchemaObject = {
  description: `"HH:mm" in ${SOCIAL_TIMEZONE}.`,
  pattern: "^\\d{2}:\\d{2}$",
  type: "string",
};
const partnerRef = { $ref: "#/components/schemas/Partner" };

const objectSchema = (properties: Record<string, SchemaObject>) => ({
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
  type: "object",
});

const EVENT_PROPERTIES: Record<keyof SocialEvent, SchemaObject> = {
  area: {
    description:
      "Coarse public area, naming the city (its cost centre's name).",
    type: "string",
  },
  attendance: nullable(
    objectSchema({
      children: {
        ...nullable(count),
        description:
          "Null for an event without children, such as a cleanup drive or a volunteer meetup; leave the children count out of the post.",
      },
      hours: { minimum: 0, type: "number" },
      volunteers: { ...count, description: "Volunteers checked in present." },
    })
  ),
  city: {
    description:
      "The event's cost centre code (for example `BLR`). Only active cost centres' events are listed.",
    type: "string",
  },
  cityName: {
    description: 'The cost centre\'s name (for example "Bangalore").',
    type: "string",
  },
  endTime: hhmm,
  id: {
    description:
      "Row id (uuid) for standalone events and materialised occurrences; `<seriesId>:<occurrenceDate>` for a virtual occurrence of a recurring series, so every week has its own id. A virtual occurrence's id changes to the row id once it is materialised.",
    type: "string",
  },
  name: { type: "string" },
  occurrenceDate: {
    description: `Calendar date in ${SOCIAL_TIMEZONE}.`,
    format: "date",
    type: "string",
  },
  partners: { items: partnerRef, type: "array" },
  photos: nullable(
    objectSchema({
      consentCleared: {
        description: "False until the consent process exists.",
        type: "boolean",
      },
      count: nullable({
        ...count,
        description:
          "Approved image photos not marked do-not-use; null until the post-event form is in.",
      }),
    })
  ),
  programme: {
    description: 'Guessed from the team name; "general" when unknown.',
    type: "string",
  },
  signUpUrl: { format: "uri", type: "string" },
  socialNotes: nullable({ type: "string" }),
  startTime: hhmm,
  status: {
    description:
      "cancelled also covers occurrences the series' exdates removed. Occurrences removed by cancelling a series from a date onwards disappear instead.",
    enum: [...socialEventStatusValues],
    type: "string",
  },
  summary: { type: "string" },
  team: { type: "string" },
  venue: objectSchema({
    instagram: nullable({ type: "string" }),
    name: { type: "string" },
  }),
  volunteers: objectSchema({
    approved: count,
    needed: count,
    waitlisted: { ...count, description: "Pending sign-up requests." },
  }),
};

const PHOTO_PROPERTIES: Record<keyof SocialPhoto, SchemaObject> = {
  caption: nullable({ type: "string" }),
  doNotUse: { type: "boolean" },
  height: { ...count, description: "Pixels; 0 when unknown." },
  id: { format: "uuid", type: "string" },
  takenAt: { format: "date-time", type: "string" },
  thumbnailUrl: {
    description: "Signed link, valid for 36 hours; no token needed.",
    format: "uri",
    type: "string",
  },
  url: {
    description: "Signed link to the original, valid for 36 hours.",
    format: "uri",
    type: "string",
  },
  width: { ...count, description: "Pixels; 0 when unknown." },
};

const STATS_PROPERTIES: Record<keyof SocialMonthlyStats, SchemaObject> = {
  allTime: objectSchema({ hours: count, optimists: count, reached: count }),
  children: count,
  hours: { minimum: 0, type: "number" },
  month: { pattern: "^\\d{4}-\\d{2}$", type: "string" },
  newOptimists: count,
  partners: { items: partnerRef, type: "array" },
  sessions: count,
  volunteers: count,
};

const POSTED_PROPERTIES: Record<string, SchemaObject> = {
  bufferPostId: { maxLength: 200, minLength: 1, type: "string" },
  channel: { enum: ["instagram", "linkedin"], type: "string" },
  eventId: {
    description:
      "The event id when the post was queued (row id, `<seriesId>:<occurrenceDate>` or a synthetic id), stored as given.",
    maxLength: 200,
    minLength: 1,
    type: "string",
  },
  eventName: nullable({
    description: "Event name when queued; event posts only.",
    maxLength: 200,
    type: "string",
  }),
  held: nullable({
    description:
      "True when the post was created as a Buffer draft for approval, false when it was scheduled automatically; null when not reported. Optional on input; a repeat without it keeps the stored value.",
    type: "boolean",
  }),
  kind: {
    enum: ["schedule", "recap", "volunteer-call", "impact", "story"],
    type: "string",
  },
  occurrenceDate: nullable({
    description: `Occurrence date in ${SOCIAL_TIMEZONE}; event posts only.`,
    format: "date",
    type: "string",
  }),
  scheduledFor: { format: "date-time", type: "string" },
  status: {
    enum: ["queued", "approved", "published", "dropped"],
    type: "string",
  },
};

const RULE_KIND_DESCRIPTIONS: Record<
  keyof typeof SOCIAL_RULES_DEFAULTS,
  string
> = {
  impact:
    "LinkedIn impact post. `postDaysAfterBuild` > 0 or `postTime` > `buildTime`.",
  recap:
    "Recap after a session. `photosMax` ≥ `slideshowMinPhotos`. Recaps whose photo consent is not cleared stay held whatever `held` says.",
  schedule:
    "Weekly schedule. `minRows` ≤ `maxRows`; `buildTime` < `postTime`, and [`buildTime`, `postTime`) contains a top-of-hour instant (HH:00) because the run is hourly.",
  story: "Schedule story.",
  volunteerCall: "Volunteer call before a session (`daysOut` 1–14).",
};

/**
 * `rules`, generated from `socialRulesSchema` so bounds cannot drift; each
 * property's `default` is the pipeline default shown on the Social page.
 */
function rulesSchema(): SchemaObject {
  const { $schema: _draft, ...schema } = z.toJSONSchema(socialRulesSchema, {
    io: "output",
  }) as SchemaObject & {
    properties: Record<string, { properties: Record<string, SchemaObject> }>;
  };
  for (const [kind, defaults] of Object.entries(SOCIAL_RULES_DEFAULTS)) {
    const kindSchema = schema.properties[kind];
    if (!kindSchema) {
      continue;
    }
    Object.assign(kindSchema, {
      description:
        RULE_KIND_DESCRIPTIONS[kind as keyof typeof SOCIAL_RULES_DEFAULTS],
    });
    for (const [field, value] of Object.entries(defaults)) {
      const fieldSchema = kindSchema.properties[field];
      if (fieldSchema) {
        fieldSchema.default = value;
      }
    }
  }
  return {
    ...schema,
    description: `Posting rules the run merges over its own defaults; every field is optional and an absent one means the pipeline default. Times are "HH:MM" (24-hour) in ${SOCIAL_TIMEZONE}. Text fields are trimmed, one line, without control characters. Cross-field rules use the default for an unset side. \`{}\` when unset or when the stored value is invalid.`,
  };
}

const SETTINGS_PROPERTIES: Record<keyof SocialSettingsResponse, SchemaObject> =
  {
    paused: {
      description:
        "Pause all posts: the run plans, renders and records nothing.",
      type: "boolean",
    },
    pausedKinds: {
      description: "Post kinds the run skips; `story` is reserved.",
      items: { enum: [...socialPostKinds], type: "string" },
      type: "array",
      uniqueItems: true,
    },
    rules: rulesSchema(),
  };

const runMessages = (description: string): SchemaObject => ({
  description: `${description} At most 1000 entries of 10000 characters; entries after the first ${SOCIAL_RUN_MAX_MESSAGES} are dropped and each is cut to ${SOCIAL_RUN_MAX_MESSAGE_LENGTH} characters.`,
  items: { maxLength: 10_000, type: "string" },
  maxItems: 1000,
  type: "array",
});

const RUN_PROPERTIES: Record<string, SchemaObject> = {
  digestSent: { type: "boolean" },
  dropped: count,
  errors: runMessages("Errors the run hit."),
  eventsSeen: count,
  finishedAt: { format: "date-time", type: "string" },
  planned: count,
  recorded: count,
  rendered: count,
  skipped: runMessages("Why planned posts were skipped."),
  startedAt: { format: "date-time", type: "string" },
  tick: { enum: [...socialRunTickValues], type: "string" },
};

const POSTED_OPTIONAL_INPUT = new Set(["eventName", "held", "occurrenceDate"]);

const json = (schema: SchemaObject | { $ref: string }) => ({
  "application/json": { schema },
});

const errorResponse = (description: string) => ({
  content: json({ $ref: "#/components/schemas/Error" }),
  description,
});

const authErrors = {
  401: errorResponse("Missing, unknown or revoked token."),
  403: errorResponse("The token lacks the required scope."),
  429: errorResponse("Rate limited; retry after the Retry-After seconds."),
};

const scope = (...scopes: string[]) => scopes.map((s) => ({ bearer: [s] }));

export function buildSocialApiOpenApi(baseUrl: string) {
  return {
    components: {
      schemas: {
        Error: objectSchema({ error: { type: "string" } }),
        Partner: objectSchema({
          instagram: nullable({ type: "string" }),
          linkedin: nullable({ type: "string" }),
          name: { type: "string" },
        }),
        PostedRecord: objectSchema(POSTED_PROPERTIES),
        PostedRecordInput: {
          ...objectSchema(POSTED_PROPERTIES),
          required: Object.keys(POSTED_PROPERTIES).filter(
            (k) => !POSTED_OPTIONAL_INPUT.has(k)
          ),
        },
        SocialEvent: objectSchema(EVENT_PROPERTIES),
        SocialRunInput: objectSchema(RUN_PROPERTIES),
        SocialSettings: objectSchema(SETTINGS_PROPERTIES),
        SocialMonthlyStats: objectSchema(STATS_PROPERTIES),
        SocialPhoto: {
          ...objectSchema(PHOTO_PROPERTIES),
          required: Object.keys(PHOTO_PROPERTIES).filter(
            (k) => k !== "caption"
          ),
        },
      },
      securitySchemes: {
        bearer: {
          description:
            "Per-consumer token from `bun run social:token create`. Scopes: events:read, photos:read, signups:read, social:write.",
          scheme: "bearer",
          type: "http",
        },
      },
    },
    info: {
      description: `Machine API for Proud Indian's social media pipeline. Bearer token per consumer; 600 requests a minute per token and endpoint; times in ${SOCIAL_TIMEZONE} unless marked UTC.`,
      title: "Proud Indian social API",
      version: "1.0.0",
    },
    openapi: "3.1.0",
    paths: {
      "/api/social/v1/events": {
        get: {
          operationId: "listSocialEvents",
          parameters: ["from", "to"].map((name) => ({
            description: `Inclusive ${SOCIAL_TIMEZONE} date; the window spans at most ${SOCIAL_EVENTS_MAX_DAYS} days, counting from and to.`,
            in: "query",
            name,
            required: true,
            schema: { format: "date", type: "string" },
          })),
          responses: {
            200: {
              content: json(
                objectSchema({
                  events: {
                    items: { $ref: "#/components/schemas/SocialEvent" },
                    type: "array",
                  },
                  timezone: { const: SOCIAL_TIMEZONE, type: "string" },
                })
              ),
              description:
                "Public occurrences in the window, cancelled ones included.",
            },
            400: errorResponse("from or to is invalid."),
            ...authErrors,
          },
          security: scope("events:read"),
          summary: "List event occurrences",
        },
      },
      "/api/social/v1/events/{id}/photos": {
        get: {
          operationId: "listSocialEventPhotos",
          parameters: [
            {
              in: "path",
              description:
                "A social event id: a row uuid, or `<seriesId>:<occurrenceDate>` for a virtual occurrence (resolved to its materialised row; no photos while it has none).",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              content: json(
                objectSchema({
                  photos: {
                    items: { $ref: "#/components/schemas/SocialPhoto" },
                    maxItems: SOCIAL_PHOTOS_MAX,
                    type: "array",
                  },
                })
              ),
              description: `Up to ${SOCIAL_PHOTOS_MAX} approved image photos: usable ones first, then do-not-use ones (flagged), each sorted by takenAt.`,
            },
            400: errorResponse("The id is not a social event id."),
            404: errorResponse("No such public event."),
            503: errorResponse("Photos are not configured."),
            ...authErrors,
          },
          security: scope("photos:read"),
          summary: "List an event's approved photos",
        },
      },
      "/api/social/v1/notify": {
        post: {
          operationId: "notifySocialApprover",
          requestBody: {
            content: json(
              objectSchema({
                lines: {
                  items: {
                    maxLength: SOCIAL_NOTIFY_MAX_LINE_LENGTH,
                    minLength: 1,
                    type: "string",
                  },
                  maxItems: SOCIAL_NOTIFY_MAX_LINES,
                  minItems: 1,
                  type: "array",
                },
                template: { const: "social-digest", type: "string" },
                to: { const: "approver", type: "string" },
              })
            ),
            required: true,
          },
          responses: {
            204: { description: "Queued (or suppressed by the kill switch)." },
            400: errorResponse("The body is invalid."),
            413: errorResponse("The body is over 64 KB."),
            503: errorResponse("No approver is configured."),
            ...authErrors,
          },
          security: scope("social:write"),
          summary: "Send the WhatsApp digest to the approver",
        },
      },
      "/api/social/v1/posted": {
        get: {
          operationId: "listSocialPosted",
          description: `Give exactly one of eventId, or from and to. The window form returns records whose occurrenceDate is in the window, or, when no occurrenceDate was stored, whose eventId is \`<uuid>:<YYYY-MM-DD>\` with the date in the window.`,
          parameters: [
            {
              in: "query",
              name: "eventId",
              required: false,
              schema: { maxLength: 200, minLength: 1, type: "string" },
            },
            ...["from", "to"].map((name) => ({
              description: `Inclusive ${SOCIAL_TIMEZONE} occurrence date; the window spans at most ${SOCIAL_EVENTS_MAX_DAYS} days, counting from and to.`,
              in: "query",
              name,
              required: false,
              schema: { format: "date", type: "string" },
            })),
          ],
          responses: {
            200: {
              content: json(
                objectSchema({
                  posted: {
                    items: { $ref: "#/components/schemas/PostedRecord" },
                    type: "array",
                  },
                })
              ),
              description: "Posts recorded for the event or window.",
            },
            400: errorResponse(
              "Neither or both of eventId and from/to, or an invalid window."
            ),
            ...authErrors,
          },
          security: scope("social:write", "events:read"),
          summary: "List recorded posts for an event or date window",
        },
        post: {
          operationId: "recordSocialPosted",
          requestBody: {
            content: json({ $ref: "#/components/schemas/PostedRecordInput" }),
            required: true,
          },
          responses: {
            204: {
              description:
                "Recorded (a repeat updates status, time, occurrenceDate and eventName; a post dropped on the dashboard stays dropped unless the repeat reports it published).",
            },
            400: errorResponse("The body is invalid."),
            413: errorResponse("The body is over 64 KB."),
            ...authErrors,
          },
          security: scope("social:write"),
          summary: "Record a queued post",
        },
      },
      "/api/social/v1/runs": {
        post: {
          description: `Called once at the end of every hourly and digest run. Only the latest ${SOCIAL_RUN_RETENTION} reports are kept; the dashboard lists them on the Social page.`,
          operationId: "recordSocialRun",
          requestBody: {
            content: json({ $ref: "#/components/schemas/SocialRunInput" }),
            required: true,
          },
          responses: {
            204: { description: "Stored." },
            400: errorResponse(
              "The body is invalid (also when finishedAt is before startedAt)."
            ),
            413: errorResponse("The body is over 64 KB."),
            ...authErrors,
          },
          security: scope("social:write"),
          summary: "Report a pipeline run",
        },
      },
      "/api/social/v1/settings": {
        get: {
          description:
            "Read at the start of every run. `paused` stops the whole run; `pausedKinds` skips those kinds; `rules` overrides posting times, limits, held flags and copy. Set on the dashboard Social page (permission `social.manage`).",
          operationId: "getSocialSettings",
          responses: {
            200: {
              content: json({ $ref: "#/components/schemas/SocialSettings" }),
              description:
                "Current pause settings and posting rules (not cached).",
            },
            ...authErrors,
          },
          security: scope("events:read"),
          summary: "Pipeline pause settings and posting rules",
        },
      },
      "/api/social/v1/stats": {
        get: {
          operationId: "getSocialMonthlyStats",
          parameters: [
            {
              in: "query",
              name: "month",
              required: true,
              schema: { pattern: "^\\d{4}-\\d{2}$", type: "string" },
            },
          ],
          responses: {
            200: {
              content: json({
                $ref: "#/components/schemas/SocialMonthlyStats",
              }),
              description: "Impact numbers for the month.",
            },
            400: errorResponse("month is invalid."),
            ...authErrors,
          },
          security: scope("events:read"),
          summary: "Monthly impact numbers",
        },
      },
    },
    servers: [{ url: new URL(baseUrl).origin }],
  };
}
