import { uuidv7 } from "uuidv7";

import type { db } from ".";
import { teamEvent, teamEventMember } from "./schema/team-event";

/**
 * A session row as Zero's mutators build it: column names as in the schema,
 * times in epoch ms.
 */
export interface SeriesSessionRow {
  [column: string]: unknown;
  cancelledAt: number | null;
  createdAt: number;
  endTime: number | null;
  feedbackDeadline: number | null;
  startTime: number;
  updatedAt: number;
}

const toDate = (ms: number | null) => (ms === null ? null : new Date(ms));

/**
 * Save sessions of a series, skipping a date someone saved meanwhile (the
 * RSVP-poll and past-session materialisers do the same), and give each new
 * row the volunteers. Returns the ids of the rows inserted.
 */
export async function saveSeriesSessions(
  tx: Pick<typeof db, "insert">,
  sessions: readonly SeriesSessionRow[],
  volunteers: readonly { addedAt: number; userId: string }[]
): Promise<string[]> {
  const inserted = await Promise.all(
    sessions.map(async (session) => {
      const [row] = await tx
        .insert(teamEvent)
        .values({
          ...(session as unknown as typeof teamEvent.$inferInsert),
          cancelledAt: toDate(session.cancelledAt),
          createdAt: new Date(session.createdAt),
          endTime: toDate(session.endTime),
          feedbackDeadline: toDate(session.feedbackDeadline),
          startTime: new Date(session.startTime),
          updatedAt: new Date(session.updatedAt),
        })
        .onConflictDoNothing({
          target: [teamEvent.seriesId, teamEvent.originalDate],
        })
        .returning({ id: teamEvent.id });
      if (row && volunteers.length > 0) {
        await tx.insert(teamEventMember).values(
          volunteers.map((member) => ({
            addedAt: new Date(member.addedAt),
            eventId: row.id,
            id: uuidv7(),
            userId: member.userId,
          }))
        );
      }
      return row?.id;
    })
  );
  return inserted.filter((id): id is string => id !== undefined);
}
