import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createHash } from "node:crypto";

import { eventRsvpVote } from "@pi-dash/db/schema/event-rsvp";
import { teamEventMember } from "@pi-dash/db/schema/team-event";

const results: unknown[][] = [];
const values = mock((..._args: unknown[]) => ({
  onConflictDoUpdate: async () => undefined,
  onConflictDoNothing: async () => undefined,
}));
const insert = mock((..._args: unknown[]) => ({ values }));
const removeWhere = mock(async (..._args: unknown[]) => undefined);
const remove = mock((..._args: unknown[]) => ({ where: removeWhere }));
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
mock.module("@pi-dash/db/queries/policies", () => ({
  safeguardingBlocks: mock(async () => false),
}));
mock.module("@pi-dash/notifications/helpers", () => ({
  getUserIdsWithPermission: mock(),
}));

import {
  processWhatsAppPollVoteWebhook,
  type WhatsAppPollVoteWebhook,
  whatsAppPollVoteWebhookSchema,
} from "./whatsapp-rsvp";

beforeEach(() => {
  results.length = 0;
  insert.mockClear();
  values.mockClear();
  remove.mockClear();
  removeWhere.mockClear();
  select.mockClear();
});

describe("WhatsApp RSVP Kalakriti roster protection", () => {
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
          event: "message",
          payload: {
            chat_id: "chat",
            from: "919876543210@s.whatsapp.net",
            id: "vote-id",
            is_from_me: false,
            poll: {
              type: "vote",
              poll_id: "poll-message-id",
              resolution_status: "resolved",
              selected_option_hashes: [selectedOption],
            },
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

describe("upstream GoWA poll votes", () => {
  const yesHash = createHash("sha256").update("Yes").digest("hex");
  const noHash = createHash("sha256").update("No").digest("hex");

  for (const vote of [
    { name: "Yes", hashes: [yesHash], selected: "yes", status: "resolved" },
    { name: "No", hashes: [noHash], selected: "no", status: "resolved" },
    { name: "cleared", hashes: [], selected: "no", status: "resolved" },
    {
      name: "Yes without a gateway poll definition",
      hashes: [yesHash],
      selected: "yes",
      status: "definition_missing",
    },
    {
      name: "unrecognized option",
      hashes: [createHash("sha256").update("Maybe").digest("hex")],
      selected: "unknown",
      status: "partially_resolved",
    },
  ]) {
    it(`records ${vote.name} and updates membership only for Yes or No`, async () => {
      results.push(
        [
          {
            id: "poll-id",
            eventId: "event-id",
            closedAt: null,
            eventStartTime: new Date("2099-01-01"),
            managementDomain: "generic",
            kalakritiEditionId: null,
            noOptionHash: noHash,
            yesOptionHash: yesHash,
          },
        ],
        [{ id: "user-id" }],
        [{ name: "Event", teamId: "team-id", cancelledAt: null }],
        [{ id: "membership-id" }]
      );
      const webhook = whatsAppPollVoteWebhookSchema.parse({
        device_id: "919000000000@s.whatsapp.net",
        event: "message",
        payload: {
          chat_id: "120363000000@g.us",
          from: "919876543210@s.whatsapp.net",
          id: "vote-id",
          is_from_me: false,
          timestamp: "2026-10-16T10:00:00Z",
          poll: {
            type: "vote",
            poll_id: "poll-message-id",
            resolution_status: vote.status,
            selected_option_hashes: vote.hashes,
          },
        },
      });

      expect(await processWhatsAppPollVoteWebhook(webhook)).toBe("processed");
      expect(insert.mock.calls[0]).toEqual([eventRsvpVote]);
      expect(values.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          phone: "919876543210",
          pollId: "poll-id",
          selectedOption: vote.selected,
          selectedOptionHashes: vote.hashes,
          userId: "user-id",
          votedAt: new Date("2026-10-16T10:00:00Z"),
          voteMessageId: "vote-id",
        })
      );

      if (vote.selected === "yes") {
        expect(insert.mock.calls[1]).toEqual([teamEventMember]);
        expect(values.mock.calls[1]?.[0]).toEqual(
          expect.objectContaining({ eventId: "event-id", userId: "user-id" })
        );
        expect(remove).not.toHaveBeenCalled();
      } else if (vote.selected === "no") {
        expect(insert).toHaveBeenCalledTimes(1);
        expect(remove).toHaveBeenCalledWith(teamEventMember);
        expect(removeWhere).toHaveBeenCalledTimes(1);
      } else {
        expect(insert).toHaveBeenCalledTimes(1);
        expect(remove).not.toHaveBeenCalled();
      }
    });
  }
});
