import { db } from "@pi-dash/db";
import {
  type MediaMigrationChange,
  type MediaMigrationRepository,
  type MediaMigrationRow,
  type MediaMigrationTable,
  parseMediaMigrationArgs,
  runR2MediaUrlMigration,
} from "@pi-dash/db/r2-media-migration";
import { user } from "@pi-dash/db/schema/auth";
import { eventFeedback } from "@pi-dash/db/schema/event-feedback";
import { eventUpdate } from "@pi-dash/db/schema/event-update";
import { and, asc, eq, gt, isNotNull } from "drizzle-orm";

const readUsers = async (
  afterId: null | string,
  limit: number
): Promise<MediaMigrationRow[]> => {
  const rows = await db
    .select({ id: user.id, value: user.image })
    .from(user)
    .where(
      afterId
        ? and(isNotNull(user.image), gt(user.id, afterId))
        : isNotNull(user.image)
    )
    .orderBy(asc(user.id))
    .limit(limit);
  return rows.flatMap((row) =>
    row.value ? [{ id: row.id, value: row.value }] : []
  );
};

const readEventUpdates = async (
  afterId: null | string,
  limit: number
): Promise<MediaMigrationRow[]> => {
  const rows = await db
    .select({
      eventId: eventUpdate.eventId,
      id: eventUpdate.id,
      value: eventUpdate.content,
    })
    .from(eventUpdate)
    .where(afterId ? gt(eventUpdate.id, afterId) : undefined)
    .orderBy(asc(eventUpdate.id))
    .limit(limit);
  return rows;
};

const readEventFeedback = async (
  afterId: null | string,
  limit: number
): Promise<MediaMigrationRow[]> => {
  const rows = await db
    .select({
      eventId: eventFeedback.eventId,
      id: eventFeedback.id,
      value: eventFeedback.content,
    })
    .from(eventFeedback)
    .where(afterId ? gt(eventFeedback.id, afterId) : undefined)
    .orderBy(asc(eventFeedback.id))
    .limit(limit);
  return rows;
};

const assertUpdated = (count: number, table: string, id: string): void => {
  if (count !== 1) {
    throw new Error(`${table} row ${id} changed while migration was running`);
  }
};

const applyUserChanges = async (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  changes: MediaMigrationChange[]
): Promise<void> => {
  const results = await Promise.all(
    changes.map((change) =>
      tx
        .update(user)
        .set({ image: change.after })
        .where(and(eq(user.id, change.id), eq(user.image, change.before)))
        .returning({ id: user.id })
    )
  );
  results.forEach((updated, index) => {
    assertUpdated(updated.length, "user", changes[index]?.id ?? "unknown");
  });
};

const applyEventUpdateChanges = async (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  changes: MediaMigrationChange[]
): Promise<void> => {
  const results = await Promise.all(
    changes.map((change) =>
      tx
        .update(eventUpdate)
        .set({ content: change.after })
        .where(
          and(
            eq(eventUpdate.id, change.id),
            eq(eventUpdate.content, change.before)
          )
        )
        .returning({ id: eventUpdate.id })
    )
  );
  results.forEach((updated, index) => {
    assertUpdated(
      updated.length,
      "event_update",
      changes[index]?.id ?? "unknown"
    );
  });
};

const applyEventFeedbackChanges = async (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  changes: MediaMigrationChange[]
): Promise<void> => {
  const results = await Promise.all(
    changes.map((change) =>
      tx
        .update(eventFeedback)
        .set({ content: change.after })
        .where(
          and(
            eq(eventFeedback.id, change.id),
            eq(eventFeedback.content, change.before)
          )
        )
        .returning({ id: eventFeedback.id })
    )
  );
  results.forEach((updated, index) => {
    assertUpdated(
      updated.length,
      "event_feedback",
      changes[index]?.id ?? "unknown"
    );
  });
};

const repository: MediaMigrationRepository = {
  applyBatch: (table, changes) =>
    db.transaction(async (tx) => {
      if (table === "user") {
        await applyUserChanges(tx, changes);
      } else if (table === "eventUpdate") {
        await applyEventUpdateChanges(tx, changes);
      } else {
        await applyEventFeedbackChanges(tx, changes);
      }
    }),
  readBatch: (
    table: MediaMigrationTable,
    afterId: null | string,
    limit: number
  ) => {
    if (table === "user") {
      return readUsers(afterId, limit);
    }
    if (table === "eventUpdate") {
      return readEventUpdates(afterId, limit);
    }
    return readEventFeedback(afterId, limit);
  },
};

const options = parseMediaMigrationArgs(process.argv.slice(2));
const report = await runR2MediaUrlMigration(repository, options);
console.log(JSON.stringify(report, null, 2));
