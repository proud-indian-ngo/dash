import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";

import { staleScheduledRecipientsQuery } from "./cleanup-stale-scheduled-recipients";

const LOCAL_DATABASE_URL =
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//;
const databaseUrl = process.env.SCHEDULED_CLEANUP_TEST_DATABASE_URL;
const integration =
  databaseUrl && LOCAL_DATABASE_URL.test(databaseUrl)
    ? describe
    : describe.skip;

// Opt-in integration test. Temporary tables shadow product tables, so fixture
// rows never touch application data even when this uses a worktree database.
integration("stale scheduled recipient PostgreSQL cleanup", () => {
  let client: SQL;
  let database: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    client = new SQL(databaseUrl!, { max: 1 });
    database = drizzle({ client });
    await database.execute(sql`
      CREATE TEMPORARY TABLE scheduled_message (
        id text PRIMARY KEY,
        scheduled_at timestamp NOT NULL
      )
    `);
    await database.execute(sql`
      CREATE TEMPORARY TABLE scheduled_message_recipient (
        id text PRIMARY KEY,
        scheduled_message_id text NOT NULL,
        status text NOT NULL,
        error text,
        updated_at timestamp NOT NULL
      )
    `);
  });

  afterAll(async () => {
    await client?.close();
  });

  beforeEach(async () => {
    await database.execute(sql`
      TRUNCATE pg_temp.scheduled_message_recipient, pg_temp.scheduled_message
    `);
  });

  it("changes only pending recipients strictly older than the cutoff", async () => {
    const threshold = new Date("2026-10-11T03:00:00.000Z");
    const updatedAt = new Date("2026-10-18T03:00:00.000Z");
    await database.execute(sql`
      INSERT INTO pg_temp.scheduled_message (id, scheduled_at) VALUES
        ('old-1', ${new Date(threshold.getTime() - 1)}),
        ('old-2', ${new Date(threshold.getTime() - 1)}),
        ('exact', ${threshold}),
        ('recent', ${new Date(threshold.getTime() + 1)})
    `);
    await database.execute(sql`
      INSERT INTO pg_temp.scheduled_message_recipient
        (id, scheduled_message_id, status, error, updated_at)
      VALUES
        ('pending-old-1', 'old-1', 'pending', NULL, ${threshold}),
        ('pending-old-2', 'old-2', 'pending', NULL, ${threshold}),
        ('sent-old', 'old-1', 'sent', NULL, ${threshold}),
        ('cancelled-old', 'old-1', 'cancelled', NULL, ${threshold}),
        ('pending-exact', 'exact', 'pending', NULL, ${threshold}),
        ('pending-recent', 'recent', 'pending', NULL, ${threshold})
    `);

    const [summary] = await database.execute(
      staleScheduledRecipientsQuery(threshold, updatedAt)
    );
    const rows = await database.execute<{
      error: string | null;
      id: string;
      status: string;
      updatedAt: Date;
    }>(sql`
      SELECT id, status, error, updated_at AS "updatedAt"
      FROM pg_temp.scheduled_message_recipient
      ORDER BY id
    `);

    expect({ ...summary }).toEqual({ cleanedUp: 2, messagesAffected: 2 });
    expect(rows.map((row) => ({ ...row }))).toEqual([
      {
        error: null,
        id: "cancelled-old",
        status: "cancelled",
        updatedAt: threshold,
      },
      {
        error: null,
        id: "pending-exact",
        status: "pending",
        updatedAt: threshold,
      },
      {
        error: "Stale: never delivered",
        id: "pending-old-1",
        status: "failed",
        updatedAt,
      },
      {
        error: "Stale: never delivered",
        id: "pending-old-2",
        status: "failed",
        updatedAt,
      },
      {
        error: null,
        id: "pending-recent",
        status: "pending",
        updatedAt: threshold,
      },
      {
        error: null,
        id: "sent-old",
        status: "sent",
        updatedAt: threshold,
      },
    ]);
  });
});
