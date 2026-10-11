import { describe, expect, it } from "bun:test";

import { db } from "@pi-dash/db";
import {
  insertSocialRun,
  listSocialPeople,
  upsertSocialPost,
} from "@pi-dash/db/queries/social-api";
import { user } from "@pi-dash/db/schema/auth";
import { socialPost } from "@pi-dash/db/schema/social-post";
import { socialRun } from "@pi-dash/db/schema/social-run";
import { SOCIAL_RUN_RETENTION } from "@pi-dash/shared/social-api";
import { count, desc, eq, sql } from "drizzle-orm";

// Needs the local database: SOCIAL_RUN_DB_TEST=1 bun test <this file>.
// Every case runs in a transaction it rolls back.
const dbTest = process.env.SOCIAL_RUN_DB_TEST === "1" ? it : it.skip;
const rollback = new Error("social-run-fixture-rollback");

const run = {
  digestSent: false,
  dropped: 0,
  errors: ["boom"],
  eventsSeen: 1,
  finishedAt: new Date("2026-10-11T04:31:00Z"),
  planned: 0,
  recorded: 0,
  rendered: 0,
  skipped: [],
  startedAt: new Date("2026-10-11T04:30:00Z"),
  tick: "hourly" as const,
};

describe("insertSocialRun retention", () => {
  dbTest(
    "keeps only the latest 500 rows, newest included, lists as jsonb arrays",
    async () => {
      let total = -1;
      let newest: number | undefined;
      let types: unknown;
      await db
        .transaction(async (tx) => {
          for (let index = 0; index < SOCIAL_RUN_RETENTION + 3; index++) {
            await insertSocialRun(
              { ...run, eventsSeen: index },
              new Date(),
              tx as unknown as typeof db
            );
          }
          [{ total }] = (await tx
            .select({ total: count() })
            .from(socialRun)) as [{ total: number }];
          newest = (
            await tx
              .select({ eventsSeen: socialRun.eventsSeen })
              .from(socialRun)
              .orderBy(desc(socialRun.id))
              .limit(1)
          )[0]?.eventsSeen;
          types = (
            await tx
              .select({
                errors: sql<string>`jsonb_typeof(${socialRun.errors})`,
                skipped: sql<string>`jsonb_typeof(${socialRun.skipped})`,
              })
              .from(socialRun)
              .orderBy(desc(socialRun.id))
              .limit(1)
          )[0];
          throw rollback;
        })
        .catch((error) => {
          if (error !== rollback) {
            throw error;
          }
        });
      expect(total).toBe(SOCIAL_RUN_RETENTION);
      expect(newest).toBe(SOCIAL_RUN_RETENTION + 2);
      // Stored as jsonb arrays, not as serialized strings.
      expect(types).toEqual({ errors: "array", skipped: "array" });
    },
    60_000
  );
});

async function rolledBack(work: (tx: typeof db) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      await work(tx as unknown as typeof db);
      throw rollback;
    })
    .catch((error) => {
      if (error !== rollback) {
        throw error;
      }
    });
}

const POST_ID = "019f0000-0050-7000-8000-000000005001";
const post = {
  bufferPostId: "db-test-buffer",
  channel: "instagram" as const,
  eventId: "db-test-event",
  eventName: null,
  kind: "recap" as const,
  occurrenceDate: null,
  scheduledFor: new Date("2026-10-12T04:30:00Z"),
};

describe("upsertSocialPost after a dashboard drop", () => {
  dbTest.each([
    ["queued", "dropped"],
    ["approved", "dropped"],
    ["published", "published"],
  ] as const)(
    "a repeat reporting %s leaves the status %s and keeps the drop history",
    async (reported, expected) => {
      let stored: Record<string, unknown> | undefined;
      await rolledBack(async (tx) => {
        const [someone] = await tx.select({ id: user.id }).from(user).limit(1);
        const now = new Date();
        await tx.insert(socialPost).values({
          ...post,
          createdAt: now,
          droppedAt: now,
          droppedBy: someone?.id ?? null,
          id: POST_ID,
          status: "dropped",
          updatedAt: now,
        });
        await upsertSocialPost({ ...post, status: reported }, new Date(), tx);
        [stored] = await tx
          .select({
            droppedAt: socialPost.droppedAt,
            status: socialPost.status,
          })
          .from(socialPost)
          .where(eq(socialPost.id, POST_ID));
      });
      expect(stored?.status).toBe(expected);
      expect(stored?.droppedAt).not.toBeNull();
    },
    60_000
  );
});

describe("listSocialPeople", () => {
  dbTest(
    "returns ids and names only, droppers included",
    async () => {
      const result = await listSocialPeople([]);
      for (const person of [...result.candidates, ...result.named]) {
        expect(Object.keys(person).sort()).toEqual(["id", "name"]);
      }
      expect(result.candidates.length).toBeGreaterThan(0);
    },
    60_000
  );
});
