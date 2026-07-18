import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(async () => undefined),
}));

vi.mock("../send-message", () => ({
  sendMessage: mocks.sendMessage,
}));

import { TOPICS } from "../topics";
import {
  notifyKalakritiGuardianReactivated,
  notifyKalakritiRegistrationLifecycle,
  notifyKalakritiScheduleChanged,
} from "./kalakriti";

describe("Kalakriti notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [
      "registration_open",
      "revision-open",
      "Kalakriti registration open",
      "Registration is now open for Kalakriti 2028.",
    ],
    [
      "registration_close_reminder",
      "1735603200000",
      "Kalakriti registration closing soon",
      "Registration for Kalakriti 2028 closes soon.",
    ],
    [
      "registration_closed",
      "revision-closed",
      "Kalakriti registration closed",
      "Registration for Kalakriti 2028 is now closed.",
    ],
  ] as const)(
    "sends %s lifecycle copy through inbox and WhatsApp",
    async (transition, transitionRevision, title, body) => {
      await notifyKalakritiRegistrationLifecycle({
        editionId: "edition-1",
        editionName: "Kalakriti 2028",
        recipientUserId: "user-1",
        transition,
        transitionRevision,
        year: 2028,
      });

      expect(mocks.sendMessage).toHaveBeenCalledWith({
        body,
        channels: ["inbox", "whatsapp"],
        clickAction: "/kalakriti/2028",
        idempotencyKey: `kalakriti-registration-edition-1-${transition}-${transitionRevision}-user-1`,
        title,
        to: "user-1",
        topic: TOPICS.KALAKRITI_REGISTRATION,
      });
    }
  );

  it("sends schedule changes to the public schedule with a revision key", async () => {
    await notifyKalakritiScheduleChanged({
      editionId: "edition-1",
      editionName: "Kalakriti 2028",
      recipientUserId: "user-1",
      scheduleRevision: "revision-1",
      year: 2028,
    });

    expect(mocks.sendMessage).toHaveBeenCalledWith({
      body: "The schedule for Kalakriti 2028 has changed.",
      channels: ["inbox", "whatsapp"],
      clickAction: "/kalakriti/2028/schedule",
      idempotencyKey: "kalakriti-schedule-edition-1-revision-1-user-1",
      title: "Kalakriti schedule updated",
      to: "user-1",
      topic: TOPICS.KALAKRITI_SCHEDULE,
    });
  });

  it("notifies reactivated Guardians with a membership-scoped key", async () => {
    await notifyKalakritiGuardianReactivated({
      editionId: "edition-1",
      editionName: "Kalakriti 2028",
      membershipId: "membership-1",
      recipientUserId: "user-1",
      year: 2028,
    });

    expect(mocks.sendMessage).toHaveBeenCalledWith({
      body: "Your Guardian access for Kalakriti 2028 is active again.",
      channels: ["inbox", "whatsapp"],
      clickAction: "/kalakriti/2028",
      idempotencyKey:
        "kalakriti-guardian-reactivated-edition-1-membership-1-user-1",
      title: "Kalakriti Guardian access restored",
      to: "user-1",
      topic: TOPICS.KALAKRITI_REGISTRATION,
    });
  });
});
