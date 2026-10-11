import {
  buildSocialEvents,
  type SocialEvent,
  type SocialEventFacts,
  type SocialEventSourceRow,
  type SocialEventsWindow,
  type SocialMonthlyStats,
  type SocialPartner,
  type SocialStatsMonth,
  SOCIAL_PHOTOS_MAX,
  summarizeSocialSessions,
} from "@pi-dash/shared/social-api";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import { appConfig } from "../schema/app-config";
import { user } from "../schema/auth";
import { eventInterest } from "../schema/event-interest";
import { eventPartner } from "../schema/event-partner";
import { eventPhoto } from "../schema/event-photo";
import {
  type SocialPostChannel,
  type SocialPostKind,
  type SocialPostStatus,
  socialPost,
} from "../schema/social-post";
import { team } from "../schema/team";
import { teamEvent, teamEventMember } from "../schema/team-event";

// Allow-list, as for the public feed: never members' contact details,
// creators, WhatsApp groups or the raw `location` column.
const sourceColumns = {
  cancelledAt: teamEvent.cancelledAt,
  childrenAttended: teamEvent.childrenAttended,
  city: teamEvent.city,
  description: teamEvent.description,
  endTime: teamEvent.endTime,
  id: teamEvent.id,
  isPublic: teamEvent.isPublic,
  managementDomain: teamEvent.managementDomain,
  name: teamEvent.name,
  originalDate: teamEvent.originalDate,
  publicArea: teamEvent.publicArea,
  recurrenceRule: teamEvent.recurrenceRule,
  seriesId: teamEvent.seriesId,
  socialCompletedAt: teamEvent.socialCompletedAt,
  socialNotes: teamEvent.socialNotes,
  startTime: teamEvent.startTime,
  teamName: team.name,
  volunteersNeeded: teamEvent.volunteersNeeded,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const SOCIAL_PHOTO_CANDIDATES_MAX = SOCIAL_PHOTOS_MAX * 5;

const toDateKey = (epochMs: number) =>
  new Date(epochMs).toISOString().slice(0, 10);

function selectSource() {
  return db
    .select(sourceColumns)
    .from(teamEvent)
    .innerJoin(team, eq(team.id, teamEvent.teamId));
}

type SourceSelect = Awaited<ReturnType<typeof selectSource>>[number];

function toSourceRow(row: SourceSelect): SocialEventSourceRow {
  return {
    ...row,
    cancelledAt: row.cancelledAt?.getTime() ?? null,
    endTime: row.endTime?.getTime() ?? null,
    managementDomain: row.managementDomain ?? null,
    socialCompletedAt: row.socialCompletedAt?.getTime() ?? null,
    startTime: row.startTime.getTime(),
  };
}

const countAll = sql<number>`count(*)`.mapWith(Number);

/**
 * Photos the social API may serve: approved, stored in Immich and an image
 * (videos and other files are never posted).
 */
const servablePhoto = and(
  eq(eventPhoto.status, "approved"),
  isNotNull(eventPhoto.immichAssetId),
  like(eventPhoto.mimeType, "image/%")
);

/** Capture time when known, else upload time. */
const photoTimeSql = sql`coalesce(${eventPhoto.takenAt}, ${eventPhoto.createdAt})`;

async function loadSocialEventFacts(
  ids: readonly string[]
): Promise<Map<string, SocialEventFacts>> {
  const facts = new Map<string, SocialEventFacts>();
  if (ids.length === 0) {
    return facts;
  }
  const factsFor = (id: string) => {
    let entry = facts.get(id);
    if (!entry) {
      entry = {
        approvedInterests: 0,
        approvedPhotos: 0,
        partners: [],
        pendingInterests: 0,
        presentVolunteers: 0,
      };
      facts.set(id, entry);
    }
    return entry;
  };
  const eventIds = [...ids];
  const [interests, present, photos, partners] = await Promise.all([
    db
      .select({
        count: countAll,
        eventId: eventInterest.eventId,
        status: eventInterest.status,
      })
      .from(eventInterest)
      .where(
        and(
          inArray(eventInterest.eventId, eventIds),
          inArray(eventInterest.status, ["approved", "pending"])
        )
      )
      .groupBy(eventInterest.eventId, eventInterest.status),
    db
      .select({ count: countAll, eventId: teamEventMember.eventId })
      .from(teamEventMember)
      .where(
        and(
          inArray(teamEventMember.eventId, eventIds),
          eq(teamEventMember.attendance, "present")
        )
      )
      .groupBy(teamEventMember.eventId),
    db
      .select({ count: countAll, eventId: eventPhoto.eventId })
      .from(eventPhoto)
      .where(
        and(
          inArray(eventPhoto.eventId, eventIds),
          servablePhoto,
          eq(eventPhoto.doNotUse, false)
        )
      )
      .groupBy(eventPhoto.eventId),
    loadPartners(eventIds),
  ]);
  for (const row of interests) {
    const entry = factsFor(row.eventId);
    if (row.status === "approved") {
      entry.approvedInterests = row.count;
    } else {
      entry.pendingInterests = row.count;
    }
  }
  for (const row of present) {
    factsFor(row.eventId).presentVolunteers = row.count;
  }
  for (const row of photos) {
    factsFor(row.eventId).approvedPhotos = row.count;
  }
  for (const [eventId, list] of partners) {
    factsFor(eventId).partners = list;
  }
  return facts;
}

async function loadPartners(
  eventIds: readonly string[]
): Promise<Map<string, SocialPartner[]>> {
  const byEvent = new Map<string, SocialPartner[]>();
  if (eventIds.length === 0) {
    return byEvent;
  }
  const rows = await db
    .select({
      eventId: eventPartner.eventId,
      instagram: eventPartner.instagram,
      linkedin: eventPartner.linkedin,
      name: eventPartner.name,
    })
    .from(eventPartner)
    .where(inArray(eventPartner.eventId, [...eventIds]))
    .orderBy(asc(eventPartner.createdAt), asc(eventPartner.id));
  for (const { eventId, ...partner } of rows) {
    const list = byEvent.get(eventId) ?? [];
    list.push(partner);
    byEvent.set(eventId, list);
  }
  return byEvent;
}

/**
 * Social events in a window: public, non-Kalakriti events in every city,
 * cancelled ones included, `from` not clamped to now.
 */
export async function getSocialEvents(
  window: SocialEventsWindow,
  baseUrl: string
): Promise<SocialEvent[]> {
  const listed = and(
    eq(teamEvent.isPublic, true),
    isNull(teamEvent.seriesId),
    isNull(teamEvent.managementDomain)
  );
  const [standalone, parents] = await Promise.all([
    selectSource().where(
      and(
        listed,
        isNull(teamEvent.recurrenceRule),
        gte(teamEvent.startTime, new Date(window.from)),
        lte(teamEvent.startTime, new Date(window.to))
      )
    ),
    selectSource().where(
      and(
        listed,
        isNotNull(teamEvent.recurrenceRule),
        lte(teamEvent.startTime, new Date(window.to))
      )
    ),
  ]);
  // Exception rows that start in the window or replace a date in it, so
  // replaced occurrences are not re-expanded (see getPublicEvents).
  const exceptions =
    parents.length === 0
      ? []
      : await selectSource().where(
          and(
            inArray(
              teamEvent.seriesId,
              parents.map((p) => p.id)
            ),
            or(
              and(
                gte(teamEvent.startTime, new Date(window.from)),
                lte(teamEvent.startTime, new Date(window.to))
              ),
              and(
                gte(teamEvent.originalDate, toDateKey(window.from - DAY_MS)),
                lte(teamEvent.originalDate, toDateKey(window.to + DAY_MS))
              )
            )
          )
        );
  const rows = [...standalone, ...parents, ...exceptions].map(toSourceRow);
  const facts = await loadSocialEventFacts(rows.map((row) => row.id));
  return buildSocialEvents(rows, window, baseUrl, facts);
}

export interface SocialPhotoRow {
  caption: string | null;
  createdAt: Date;
  doNotUse: boolean;
  height: number | null;
  id: string;
  immichAssetId: string;
  takenAt: Date | null;
  width: number | null;
}

/**
 * The exception row materialised for a series occurrence (`originalDate`
 * is the series' date key), or null when the occurrence is still virtual.
 */
export async function findSocialOccurrenceRowId(
  seriesId: string,
  occDate: string
): Promise<string | null> {
  const [row] = await db
    .select({ id: teamEvent.id })
    .from(teamEvent)
    .where(
      and(eq(teamEvent.seriesId, seriesId), eq(teamEvent.originalDate, occDate))
    )
    .limit(1);
  return row?.id ?? null;
}

/**
 * Approved Immich-backed image photos of a public, non-Kalakriti event:
 * usable photos first, then "do not use" ones, each oldest first by capture
 * (else upload) time. Null when the event is not listed.
 */
export async function getSocialEventPhotos(
  eventId: string
): Promise<SocialPhotoRow[] | null> {
  const [event] = await db
    .select({ id: teamEvent.id })
    .from(teamEvent)
    .where(
      and(
        eq(teamEvent.id, eventId),
        eq(teamEvent.isPublic, true),
        isNull(teamEvent.managementDomain)
      )
    )
    .limit(1);
  if (!event) {
    return null;
  }
  const rows = await db
    .select({
      caption: eventPhoto.caption,
      createdAt: eventPhoto.createdAt,
      doNotUse: eventPhoto.doNotUse,
      height: eventPhoto.height,
      id: eventPhoto.id,
      immichAssetId: eventPhoto.immichAssetId,
      takenAt: eventPhoto.takenAt,
      width: eventPhoto.width,
    })
    .from(eventPhoto)
    .where(and(eq(eventPhoto.eventId, eventId), servablePhoto))
    .orderBy(
      asc(eventPhoto.doNotUse),
      asc(photoTimeSql),
      asc(eventPhoto.createdAt),
      asc(eventPhoto.id)
    )
    // Capture times may still be unknown here; the handler backfills them,
    // re-ranks and keeps the first SOCIAL_PHOTOS_MAX.
    .limit(SOCIAL_PHOTO_CANDIDATES_MAX);
  return rows.flatMap((row) =>
    row.immichAssetId ? [{ ...row, immichAssetId: row.immichAssetId }] : []
  );
}

/**
 * Persist backfilled photo metadata; never overwrites a known value. The
 * handler stores 0 for a size Immich does not know, so the asset is not
 * fetched again.
 */
export async function updateSocialPhotoMetadata(
  photoId: string,
  metadata: {
    height: number | null;
    takenAt: Date | null;
    width: number | null;
  }
): Promise<void> {
  await db
    .update(eventPhoto)
    .set({
      height: sql`coalesce(${eventPhoto.height}, ${metadata.height})`,
      takenAt: sql`coalesce(${eventPhoto.takenAt}, ${metadata.takenAt})`,
      width: sql`coalesce(${eventPhoto.width}, ${metadata.width})`,
    })
    .where(eq(eventPhoto.id, photoId));
}

/** Immich asset id of a servable photo, for the signed media proxy. */
export async function getSocialPhotoAssetId(
  photoId: string
): Promise<string | null> {
  const [row] = await db
    .select({ immichAssetId: eventPhoto.immichAssetId })
    .from(eventPhoto)
    .where(and(eq(eventPhoto.id, photoId), servablePhoto))
    .limit(1);
  return row?.immichAssetId ?? null;
}

/**
 * Monthly impact numbers before all-time overrides. Sessions are completed,
 * non-cancelled rows (`social_completed_at` set) starting in the month,
 * India time; see `summarizeSocialSessions` for the private-event rule.
 */
export async function getSocialMonthlyStats(
  month: SocialStatsMonth
): Promise<SocialMonthlyStats> {
  const completed = and(
    isNotNull(teamEvent.socialCompletedAt),
    isNull(teamEvent.cancelledAt)
  );
  const rows = await db
    .select({
      cancelledAt: teamEvent.cancelledAt,
      childrenAttended: teamEvent.childrenAttended,
      endTime: teamEvent.endTime,
      id: teamEvent.id,
      isPublic: teamEvent.isPublic,
      seriesId: teamEvent.seriesId,
      startTime: teamEvent.startTime,
    })
    .from(teamEvent)
    .where(
      and(
        completed,
        gte(teamEvent.startTime, new Date(month.from)),
        lte(teamEvent.startTime, new Date(month.to))
      )
    );
  const sessionRows = rows.map((row) => ({
    ...row,
    cancelledAt: row.cancelledAt?.getTime() ?? null,
    endTime: row.endTime?.getTime() ?? null,
    startTime: row.startTime.getTime(),
  }));
  const ids = sessionRows.map((s) => s.id);
  const parentIds = sessionRows.flatMap((s) =>
    s.seriesId ? [s.seriesId] : []
  );

  const [volunteerRows, partners, newUsers, activeUsers, allTime] =
    await Promise.all([
      ids.length === 0
        ? [{ count: 0 }]
        : db
            .select({
              count:
                sql<number>`count(distinct ${teamEventMember.userId})`.mapWith(
                  Number
                ),
            })
            .from(teamEventMember)
            .where(
              and(
                inArray(teamEventMember.eventId, ids),
                eq(teamEventMember.attendance, "present")
              )
            ),
      loadPartners([...new Set([...ids, ...parentIds])]),
      db
        .select({ count: countAll })
        .from(user)
        .where(
          and(
            eq(user.isActive, true),
            gte(user.createdAt, new Date(month.from)),
            lte(user.createdAt, new Date(month.to))
          )
        ),
      db.select({ count: countAll }).from(user).where(eq(user.isActive, true)),
      db
        .select({
          hours:
            sql<number>`coalesce(sum(greatest(extract(epoch from (${teamEvent.endTime} - ${teamEvent.startTime})), 0)), 0) / 3600`.mapWith(
              Number
            ),
          reached:
            sql<number>`coalesce(sum(${teamEvent.childrenAttended}), 0)`.mapWith(
              Number
            ),
        })
        .from(teamEvent)
        .where(completed),
    ]);

  const summary = summarizeSocialSessions(sessionRows, partners);
  return {
    allTime: {
      hours: Math.round(allTime[0]?.hours ?? 0),
      optimists: activeUsers[0]?.count ?? 0,
      reached: allTime[0]?.reached ?? 0,
    },
    children: summary.children,
    hours: summary.hours,
    month: month.month,
    newOptimists: newUsers[0]?.count ?? 0,
    partners: summary.partners,
    sessions: summary.sessions,
    volunteers: volunteerRows[0]?.count ?? 0,
  };
}

/** app_config values for the given keys; absent keys are omitted. */
export async function getAppConfigValues(
  keys: readonly string[]
): Promise<Map<string, string>> {
  if (keys.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ key: appConfig.key, value: appConfig.value })
    .from(appConfig)
    .where(inArray(appConfig.key, [...keys]));
  return new Map(rows.map((row) => [row.key, row.value]));
}

export interface SocialPostInput {
  bufferPostId: string;
  channel: SocialPostChannel;
  eventId: string;
  eventName: string | null;
  kind: SocialPostKind;
  /** India calendar date (YYYY-MM-DD) of the occurrence; event posts only. */
  occurrenceDate: string | null;
  scheduledFor: Date;
  status: SocialPostStatus;
}

/**
 * Record a queued post; a repeat of the same post updates status, time,
 * occurrence date and event name.
 */
export async function upsertSocialPost(
  input: SocialPostInput,
  now: Date
): Promise<void> {
  await db
    .insert(socialPost)
    .values({ ...input, createdAt: now, id: uuidv7(), updatedAt: now })
    .onConflictDoUpdate({
      set: {
        eventName: input.eventName,
        occurrenceDate: input.occurrenceDate,
        scheduledFor: input.scheduledFor,
        status: input.status,
        updatedAt: now,
      },
      target: [
        socialPost.eventId,
        socialPost.channel,
        socialPost.kind,
        socialPost.bufferPostId,
      ],
    });
}

const socialPostColumns = {
  bufferPostId: socialPost.bufferPostId,
  channel: socialPost.channel,
  eventId: socialPost.eventId,
  eventName: socialPost.eventName,
  kind: socialPost.kind,
  occurrenceDate: socialPost.occurrenceDate,
  scheduledFor: socialPost.scheduledFor,
  status: socialPost.status,
};

export async function listSocialPosts(
  eventId: string
): Promise<SocialPostInput[]> {
  return await db
    .select(socialPostColumns)
    .from(socialPost)
    .where(eq(socialPost.eventId, eventId))
    .orderBy(asc(socialPost.scheduledFor), asc(socialPost.id));
}

/** `<uuid>:<YYYY-MM-DD>`, the social API id of a virtual occurrence. */
const COMPOSITE_EVENT_ID_SQL =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:[0-9]{4}-[0-9]{2}-[0-9]{2}$";

/**
 * Posts for occurrences dated `from`..`to` (inclusive YYYY-MM-DD): those
 * whose `occurrence_date` is in the window, and those without one whose
 * `event_id` is a composite occurrence id dated in the window.
 */
export async function listSocialPostsInWindow(
  from: string,
  to: string
): Promise<SocialPostInput[]> {
  const compositeDate = sql`right(${socialPost.eventId}, 10)`;
  return await db
    .select(socialPostColumns)
    .from(socialPost)
    .where(
      or(
        and(
          gte(socialPost.occurrenceDate, from),
          lte(socialPost.occurrenceDate, to)
        ),
        and(
          isNull(socialPost.occurrenceDate),
          sql`${socialPost.eventId} ~ ${COMPOSITE_EVENT_ID_SQL}`,
          sql`${compositeDate} >= ${from}`,
          sql`${compositeDate} <= ${to}`
        )
      )
    )
    .orderBy(asc(socialPost.scheduledFor), asc(socialPost.id));
}
