import { beforeEach, describe, expect, it, mock } from "bun:test";

import { PgDialect } from "drizzle-orm/pg-core";

const hoisted = <T>(factory: () => T): T => factory();

const mocks = hoisted(() => ({
  emit: mock(),
  execute: mock(),
  set: mock(),
}));

mock.module("@pi-dash/db", () => ({
  db: { execute: mocks.execute },
}));
mock.module("evlog", () => ({
  createRequestLogger: () => ({ emit: mocks.emit, set: mocks.set }),
}));

const { handleCleanupStaleScheduledRecipients, staleScheduledRecipientsQuery } =
  await import("./cleanup-stale-scheduled-recipients");

beforeEach(() => {
  mock.clearAllMocks();
  mocks.execute.mockResolvedValue([{ cleanedUp: 0, messagesAffected: 0 }]);
});

describe("stale scheduled recipient cleanup", () => {
  it("updates and aggregates the backlog in one database statement", async () => {
    mocks.execute.mockResolvedValue([
      { cleanedUp: 2500, messagesAffected: 300 },
    ]);

    await handleCleanupStaleScheduledRecipients([]);

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith({ staleCount: 2500 });
    expect(mocks.set).toHaveBeenCalledWith({
      cleanedUp: 2500,
      event: "job_complete",
      messagesAffected: 300,
    });
  });

  it("reports an empty cleanup from the same aggregate statement", async () => {
    await handleCleanupStaleScheduledRecipients([]);

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith({
      event: "no_stale_recipients",
    });
  });

  it("rechecks pending status and uses a strict seven-day cutoff", () => {
    const threshold = new Date("2026-10-11T03:00:00.000Z");
    const updatedAt = new Date("2026-10-18T03:00:00.000Z");
    const rendered = new PgDialect().sqlToQuery(
      staleScheduledRecipientsQuery(threshold, updatedAt)
    );
    const statement = rendered.sql.replaceAll(/\s+/g, " ").trim();

    expect(statement).toContain(
      'UPDATE "scheduled_message_recipient" SET error = $1, status = $2, updated_at = $3 FROM "scheduled_message"'
    );
    expect(statement).toContain('"scheduled_message_recipient"."status" = $4');
    expect(statement).toContain('"scheduled_message"."scheduled_at" < $5');
    expect(statement).toContain(
      'count(DISTINCT scheduled_message_id)::int AS "messagesAffected"'
    );
    expect(rendered.params).toEqual([
      "Stale: never delivered",
      "failed",
      updatedAt,
      "pending",
      threshold,
    ]);
  });
});
