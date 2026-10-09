import { cityValues } from "./constants";
import {
  PUBLIC_EVENTS_DEFAULT_DAYS,
  PUBLIC_EVENTS_DEFAULT_LIMIT,
  PUBLIC_EVENTS_MAX_DAYS,
  PUBLIC_EVENTS_MAX_LIMIT,
  PUBLIC_EVENTS_SUMMARY_MAX,
  type PublicEvent,
  type PublicEventsResponse,
  publicProgrammeValues,
} from "./public-events";

/**
 * OpenAPI 3.1 description of the public events feed (`GET /api/public/events`), served at
 * `/api/public/openapi.json` and listed in proudindian.ngo's `/.well-known/api-catalog`.
 * Limits and enums come from the feed's own constants; the `Record<keyof …>` types make a
 * field added to or removed from `PublicEvent` fail type checking until the schema matches.
 */

interface SchemaObject {
  [key: string]: unknown;
  description?: string;
  type?: string;
}

const PUBLIC_EVENT_PROPERTIES: Record<keyof PublicEvent, SchemaObject> = {
  area: {
    description:
      'Coarse public area set by the organisers, always naming the city ("Bellandur, Bengaluru"); never the exact location.',
    type: "string",
  },
  city: { enum: [...cityValues], type: "string" },
  endTime: {
    description:
      "End of the session (UTC). Open-ended sessions end when they start.",
    format: "date-time",
    type: "string",
  },
  id: {
    description:
      "Event id. Every occurrence of a recurring series shares the series id; tell them apart by occurrenceDate.",
    format: "uuid",
    type: "string",
  },
  name: { type: "string" },
  occurrenceDate: {
    description: "Calendar date of the session in India (Asia/Kolkata).",
    format: "date",
    type: "string",
  },
  programme: {
    description:
      "Programme the session belongs to, guessed from the team. Absent when unknown.",
    enum: [...publicProgrammeValues],
    type: "string",
  },
  signUpUrl: {
    description:
      "Where a volunteer signs up for this session. New volunteers register first; the session is requested once their email is verified.",
    format: "uri",
    type: "string",
  },
  startTime: {
    description: "Start of the session (UTC).",
    format: "date-time",
    type: "string",
  },
  summary: {
    description: `Plain-text summary of the description: no links, emails or phone numbers, at most ${PUBLIC_EVENTS_SUMMARY_MAX} characters. May be empty.`,
    maxLength: PUBLIC_EVENTS_SUMMARY_MAX,
    type: "string",
  },
  team: {
    description: "Name of the team running the session.",
    type: "string",
  },
};

const OPTIONAL_PUBLIC_EVENT_FIELDS = new Set<keyof PublicEvent>(["programme"]);

const RESPONSE_PROPERTIES: Record<keyof PublicEventsResponse, SchemaObject> = {
  events: {
    description: "Upcoming sessions in the window, sorted by start time.",
    items: { $ref: "#/components/schemas/PublicEvent" },
    type: "array",
  },
  generatedAt: {
    description: "When the list was built.",
    format: "date-time",
    type: "string",
  },
};

const errorResponse = (description: string) => ({
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/Error" } },
  },
  description,
});

export function buildPublicEventsOpenApi(baseUrl: string) {
  return {
    components: {
      schemas: {
        Error: {
          properties: { error: { type: "string" } },
          required: ["error"],
          type: "object",
        },
        PublicEvent: {
          additionalProperties: false,
          properties: PUBLIC_EVENT_PROPERTIES,
          required: Object.keys(PUBLIC_EVENT_PROPERTIES).filter(
            (key) => !OPTIONAL_PUBLIC_EVENT_FIELDS.has(key as keyof PublicEvent)
          ),
          type: "object",
        },
        PublicEventsResponse: {
          additionalProperties: false,
          properties: RESPONSE_PROPERTIES,
          required: Object.keys(RESPONSE_PROPERTIES),
          type: "object",
        },
      },
    },
    info: {
      contact: {
        email: "connect@proudindian.ngo",
        name: "Proud Indian",
        url: "https://proudindian.ngo",
      },
      description:
        "Upcoming public volunteering sessions run by Proud Indian, a volunteer-run NGO. No authentication; read-only; rate limited to 60 requests a minute per client. Responses may be cached for 5 minutes.",
      title: "Proud Indian public events",
      version: "1.0.0",
    },
    openapi: "3.1.0",
    paths: {
      "/api/public/events": {
        get: {
          description:
            "Public, non-cancelled sessions that start in the window, with recurring series expanded into one entry per session.",
          operationId: "listPublicEvents",
          parameters: [
            {
              description: "City to list sessions for.",
              in: "query",
              name: "city",
              schema: {
                default: "bangalore",
                enum: [...cityValues],
                type: "string",
              },
            },
            {
              description:
                "Start of the window: a date (midnight in India) or an ISO timestamp. Defaults to now; a past value is treated as now.",
              in: "query",
              name: "from",
              schema: {
                anyOf: [
                  { format: "date", type: "string" },
                  { format: "date-time", type: "string" },
                ],
              },
            },
            {
              description: `Length of the window in days. Values above ${PUBLIC_EVENTS_MAX_DAYS} are capped.`,
              in: "query",
              name: "days",
              schema: {
                default: PUBLIC_EVENTS_DEFAULT_DAYS,
                maximum: PUBLIC_EVENTS_MAX_DAYS,
                minimum: 1,
                type: "integer",
              },
            },
            {
              description: `Most sessions to return. Values above ${PUBLIC_EVENTS_MAX_LIMIT} are capped.`,
              in: "query",
              name: "limit",
              schema: {
                default: PUBLIC_EVENTS_DEFAULT_LIMIT,
                maximum: PUBLIC_EVENTS_MAX_LIMIT,
                minimum: 1,
                type: "integer",
              },
            },
          ],
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PublicEventsResponse" },
                },
              },
              description: "The sessions.",
            },
            400: errorResponse("A query parameter is invalid."),
            429: errorResponse(
              "Too many requests; retry after the Retry-After header's seconds."
            ),
            500: errorResponse("Events are unavailable right now."),
          },
          summary: "List upcoming volunteering sessions",
        },
      },
    },
    // No authentication.
    security: [],
    servers: [{ url: new URL(baseUrl).origin }],
  };
}
