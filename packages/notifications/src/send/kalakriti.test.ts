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
  notifyKalakritiTransportChanged,
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
      { label: "Open", tone: "success" },
      "now open",
    ],
    [
      "registration_close_reminder",
      "1735603200000",
      "Kalakriti registration closing soon",
      "Registration for Kalakriti 2028 closes soon.",
      { label: "Closing soon", tone: "warning" },
      "closing soon",
    ],
    [
      "registration_closed",
      "revision-closed",
      "Kalakriti registration closed",
      "Registration for Kalakriti 2028 is now closed.",
      { label: "Closed", tone: "neutral" },
      "now closed",
    ],
  ] as const)(
    "sends %s lifecycle copy through inbox and WhatsApp",
    async (
      transition,
      transitionRevision,
      title,
      body,
      status,
      templateStatus
    ) => {
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
        digest: { meta: "Registration", name: "Kalakriti 2028", status },
        idempotencyKey: `kalakriti-registration-edition-1-${transition}-${transitionRevision}-user-1`,
        title,
        to: "user-1",
        topic: TOPICS.KALAKRITI_REGISTRATION,
        whatsappTemplate: {
          name: "kalakriti_registration",
          params: { edition: "Kalakriti 2028", status: templateStatus },
          path: "kalakriti/2028",
        },
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
      whatsappTemplate: {
        name: "kalakriti_schedule_changed",
        params: { edition: "Kalakriti 2028" },
        path: "kalakriti/2028/schedule",
      },
    });
  });

  it("sends transport changes to the Center detail with a stable key", async () => {
    await notifyKalakritiTransportChanged({
      assignmentId: "assignment-1",
      centerId: "center-1",
      changeId: "change-1",
      editionId: "edition-1",
      editionName: "Kalakriti 2028",
      recipientUserId: "user-1",
      year: 2028,
    });

    expect(mocks.sendMessage).toHaveBeenCalledWith({
      body: "Transport details changed for Kalakriti 2028.",
      channels: ["inbox", "whatsapp"],
      clickAction: "/kalakriti/2028/centers?centerId=center-1",
      idempotencyKey:
        "kalakriti-transport-edition-1-assignment-1-change-1-user-1",
      title: "Kalakriti transport updated",
      to: "user-1",
      topic: TOPICS.KALAKRITI_TRANSPORT,
      whatsappTemplate: {
        name: "kalakriti_transport_changed",
        params: { edition: "Kalakriti 2028" },
        path: "kalakriti/2028/centers?centerId=center-1",
      },
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
      digest: {
        meta: "Your Guardian access is active again",
        name: "Kalakriti 2028",
        status: { label: "Restored", tone: "success" },
      },
      idempotencyKey:
        "kalakriti-guardian-reactivated-edition-1-membership-1-user-1",
      title: "Kalakriti Guardian access restored",
      to: "user-1",
      topic: TOPICS.KALAKRITI_REGISTRATION,
      whatsappTemplate: {
        name: "kalakriti_guardian_reactivated",
        params: { edition: "Kalakriti 2028" },
        path: "kalakriti/2028",
      },
    });
  });
});
