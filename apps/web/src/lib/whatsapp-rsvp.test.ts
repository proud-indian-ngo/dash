import { beforeEach, describe, expect, it, mock } from "bun:test";

const results: unknown[][] = [];
const insert = mock();
const remove = mock();
const select = mock(() => {
  const query = {
    from: () => query,
    innerJoin: () => query,
    leftJoin: () => query,
    where: () => query,
    limit: () => Promise.resolve(results.shift() ?? []),
  };
  return query;
});
mock.module("@pi-dash/db", () => ({ db: { select, insert, delete: remove } }));
mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue: mock() }));
mock.module("@pi-dash/notifications/helpers", () => ({
  getUserIdsWithPermission: mock(),
}));

import {
  processWhatsAppPollVoteWebhook,
  type WhatsAppPollVoteWebhook,
} from "./whatsapp-rsvp";

describe("WhatsApp RSVP Kalakriti roster protection", () => {
  beforeEach(() => {
    results.length = 0;
    insert.mockClear();
    remove.mockClear();
    select.mockClear();
  });

  for (const selectedOption of ["yes", "no"]) {
    for (const linkage of [
      { managementDomain: "kalakriti", kalakritiEditionId: null },
      { managementDomain: "generic", kalakritiEditionId: "edition-id" },
    ]) {
      it(`ignores ${selectedOption} for ${JSON.stringify(linkage)} before any writes`, async () => {
        results.push([
          {
            ...linkage,
            id: "poll-id",
            eventId: "event-id",
            closedAt: null,
            eventStartTime: new Date("2099-01-01"),
            noOptionHash: "no",
            yesOptionHash: "yes",
          },
        ]);
        const webhook: WhatsAppPollVoteWebhook = {
          device_id: "device",
          event: "message.poll_vote",
          payload: {
            chat_id: "chat",
            from: "919876543210@s.whatsapp.net",
            id: "vote-id",
            is_from_me: false,
            poll_message_id: "poll-message-id",
            selected_option_count: 1,
            selected_option_hashes: [selectedOption],
            timestamp: new Date().toISOString(),
          },
        };
        expect(await processWhatsAppPollVoteWebhook(webhook)).toBe("ignored");
        expect(select).toHaveBeenCalledTimes(1);
        expect(insert).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
      });
    }
  }
});
