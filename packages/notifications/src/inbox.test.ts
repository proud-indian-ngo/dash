import { beforeEach, describe, expect, it, vi } from "vitest";

const storedRows = vi.hoisted(() => [] as Array<{ idempotencyKey: string }>);
const pendingRows = vi.hoisted(() => [] as Array<{ idempotencyKey: string }>);
const onConflictDoNothing = vi.hoisted(() => vi.fn());

vi.mock("@pi-dash/db", () => ({
  db: {
    insert: vi.fn(() => {
      const query = {
        onConflictDoNothing: onConflictDoNothing.mockImplementation(() => {
          const row = pendingRows.shift();
          if (
            row &&
            !storedRows.some(
              ({ idempotencyKey }) => idempotencyKey === row.idempotencyKey
            )
          ) {
            storedRows.push(row);
          }
        }),
        values: vi.fn((row: { idempotencyKey: string }) => {
          pendingRows.push(row);
          return query;
        }),
      };
      return query;
    }),
  },
}));
vi.mock("uuidv7", () => ({ uuidv7: vi.fn(() => "notification-id") }));

import { insertNotification } from "./inbox";

describe("insertNotification", () => {
  beforeEach(() => {
    pendingRows.length = 0;
    storedRows.length = 0;
    onConflictDoNothing.mockClear();
  });

  it("keeps one inbox identity when the same delivery is retried", async () => {
    const message = {
      body: "Schedule changed",
      idempotencyKey: "kalakriti-schedule-edition-1-revision-1-user-1-inbox",
      title: "Kalakriti schedule updated",
      topicId: "Kalakriti - Schedule",
      userId: "user-1",
    };

    await insertNotification(message);
    await insertNotification(message);

    expect(onConflictDoNothing).toHaveBeenCalledTimes(2);
    expect(storedRows).toHaveLength(1);
    expect(storedRows[0]).toMatchObject({
      idempotencyKey: message.idempotencyKey,
    });
  });
});
