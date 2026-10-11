import {
  listSocialPosts,
  listSocialPostsInWindow,
  upsertSocialPost,
} from "@pi-dash/db/queries/social-api";
import {
  socialPostChannelValues,
  socialPostKindValues,
  socialPostStatusValues,
} from "@pi-dash/db/schema/social-post";
import {
  parseSocialEventsWindow,
  parseVirtualSocialEventId,
  SocialApiQueryError,
} from "@pi-dash/shared/social-api";
import * as z from "zod";

import { runAuditedAction } from "@/lib/audit";
import { socialJsonError } from "@/lib/social-api-auth";

import {
  defaultSocialAuthorize,
  readJsonBody,
  type SocialAuthorize,
  socialJson,
  socialNoContent,
  socialServerError,
} from "./shared";

// Fits a row id and the virtual occurrence form `${seriesId}:${occDate}`.
const MAX_ID_LENGTH = 200;
const MAX_EVENT_NAME_LENGTH = 200;

export const postedRecordSchema = z.strictObject({
  bufferPostId: z.string().trim().min(1).max(MAX_ID_LENGTH),
  channel: z.enum(socialPostChannelValues),
  eventId: z.string().trim().min(1).max(MAX_ID_LENGTH),
  /** Event name when the post was queued; event posts only. */
  eventName: z.string().trim().max(MAX_EVENT_NAME_LENGTH).nullish(),
  /** True: created as a Buffer draft for approval; false: scheduled automatically. */
  held: z.boolean().nullish(),
  kind: z.enum(socialPostKindValues),
  /** India calendar date of the occurrence (YYYY-MM-DD); event posts only. */
  occurrenceDate: z.iso.date().nullish(),
  scheduledFor: z.iso.datetime({ offset: true }),
  status: z.enum(socialPostStatusValues),
});

type PostedRecordInput = z.infer<typeof postedRecordSchema>;

/** A stored record as the API returns it: unset optional fields are null. */
export type PostedRecord = Omit<
  PostedRecordInput,
  "eventName" | "held" | "occurrenceDate"
> & {
  eventName: string | null;
  held: boolean | null;
  occurrenceDate: string | null;
};

const eventIdSchema = z.string().trim().min(1).max(MAX_ID_LENGTH);

export interface SocialPostedDeps {
  authorize: SocialAuthorize;
  listSocialPosts: typeof listSocialPosts;
  listSocialPostsInWindow: typeof listSocialPostsInWindow;
  now: () => Date;
  runAuditedAction: typeof runAuditedAction;
  upsertSocialPost: typeof upsertSocialPost;
}

const defaultDeps: SocialPostedDeps = {
  authorize: defaultSocialAuthorize,
  listSocialPosts,
  listSocialPostsInWindow,
  now: () => new Date(),
  runAuditedAction,
  upsertSocialPost,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Audit target for a posted record's free-text event id: a bare uuid is a
 * `team_event` row; a virtual occurrence id names its series row; anything
 * else carries no id.
 */
export function postedAuditTarget(eventId: string): {
  id?: string;
  type: string;
} {
  if (UUID_RE.test(eventId)) {
    return { id: eventId, type: "teamEvent" };
  }
  const virtual = parseVirtualSocialEventId(eventId);
  if (virtual && UUID_RE.test(virtual.seriesId)) {
    return { id: virtual.seriesId, type: "teamEventSeries" };
  }
  return { type: "socialPost" };
}

/** `POST /api/social/v1/posted` (scope social:write): record a queued post. */
export async function handleSocialPostedWrite(
  request: Request,
  deps: SocialPostedDeps = defaultDeps
): Promise<Response> {
  const auth = await deps.authorize(request, "social:write", "posted");
  if (auth.error) {
    return auth.error;
  }
  const read = await readJsonBody(request);
  if ("tooLarge" in read) {
    return read.tooLarge;
  }
  const parsed = postedRecordSchema.safeParse(read.body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid posted record",
        issues: parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.join("."),
        })),
      },
      { headers: { "Cache-Control": "no-store" }, status: 400 }
    );
  }
  const record = parsed.data;
  const { token } = auth;
  try {
    await deps.runAuditedAction(
      {
        action: "social.posted.record",
        actor: { name: token.name, role: "social-api", userId: token.id },
        metadata: {
          channel: record.channel,
          kind: record.kind,
          status: record.status,
        },
        target: postedAuditTarget(record.eventId),
      },
      () =>
        deps.upsertSocialPost(
          {
            ...record,
            eventName: record.eventName || null,
            held: record.held ?? null,
            occurrenceDate: record.occurrenceDate ?? null,
            scheduledFor: new Date(record.scheduledFor),
          },
          deps.now()
        )
    );
    return socialNoContent();
  } catch (error) {
    return socialServerError(request, error, { tokenId: token.id });
  }
}

type PostedQuery =
  | { eventId: string; kind: "event" }
  | { from: string; kind: "window"; to: string };

/**
 * Exactly one of `eventId` or `from` + `to` (India dates, inclusive, at most
 * 120 days, as for /events). Throws `SocialApiQueryError` otherwise.
 */
function parsePostedQuery(params: URLSearchParams): PostedQuery {
  const hasWindow = params.has("from") || params.has("to");
  if (params.has("eventId")) {
    if (hasWindow) {
      throw new SocialApiQueryError(
        "give either eventId or from and to, not both"
      );
    }
    const eventId = eventIdSchema.safeParse(params.get("eventId"));
    if (!eventId.success) {
      throw new SocialApiQueryError("eventId must not be empty");
    }
    return { eventId: eventId.data, kind: "event" };
  }
  if (!hasWindow) {
    throw new SocialApiQueryError("eventId or from and to is required");
  }
  parseSocialEventsWindow(params);
  return {
    from: params.get("from") ?? "",
    kind: "window",
    to: params.get("to") ?? "",
  };
}

/**
 * `GET /api/social/v1/posted?eventId=...` or `?from=YYYY-MM-DD&to=YYYY-MM-DD`
 * (scope social:write or events:read). The window form returns records whose
 * occurrence date, or the date of a composite occurrence id when none was
 * stored, falls in the window.
 */
export async function handleSocialPostedRead(
  request: Request,
  deps: SocialPostedDeps = defaultDeps
): Promise<Response> {
  const auth = await deps.authorize(
    request,
    ["social:write", "events:read"],
    "posted"
  );
  if (auth.error) {
    return auth.error;
  }
  let query: PostedQuery;
  try {
    query = parsePostedQuery(new URL(request.url).searchParams);
  } catch (error) {
    if (error instanceof SocialApiQueryError) {
      return socialJsonError(400, error.message);
    }
    throw error;
  }
  try {
    const rows =
      query.kind === "event"
        ? await deps.listSocialPosts(query.eventId)
        : await deps.listSocialPostsInWindow(query.from, query.to);
    const posted: PostedRecord[] = rows.map((row) => ({
      ...row,
      scheduledFor: row.scheduledFor.toISOString(),
    }));
    return socialJson({ posted });
  } catch (error) {
    return socialServerError(request, error);
  }
}
