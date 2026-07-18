import { beforeEach, describe, expect, it, vi } from "vitest";

const notificationEdition = vi.hoisted(() => vi.fn());
const guardianRecipients = vi.hoisted(() => vi.fn());
const scheduleRecipients = vi.hoisted(() => vi.fn());
const notifyRegistration = vi.hoisted(() => vi.fn(async () => undefined));
const notifySchedule = vi.hoisted(() => vi.fn(async () => undefined));
const notifyReactivation = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../lib/kalakriti-notification-recipients", () => ({
  getKalakritiNotificationEdition: notificationEdition,
  resolveKalakritiGuardianRecipients: guardianRecipients,
  resolveKalakritiScheduleRecipients: scheduleRecipients,
}));
vi.mock("@pi-dash/notifications/send/kalakriti", () => ({
  notifyKalakritiGuardianReactivated: notifyReactivation,
  notifyKalakritiRegistrationLifecycle: notifyRegistration,
  notifyKalakritiScheduleChanged: notifySchedule,
}));
vi.mock("@pi-dash/notifications/send-message", () => ({
  captureSends: async (callback: () => Promise<unknown>) => ({
    result: await callback(),
    sends: [],
  }),
}));

import {
  handleNotifyKalakritiGuardianReactivated,
  handleNotifyKalakritiRegistrationOpen,
  handleNotifyKalakritiScheduleChanged,
  handleRemindKalakritiRegistrationClose,
} from "./notify-kalakriti";

const edition = {
  id: "edition-1",
  lifecycle: "registration_open",
  name: "Kalakriti 2028",
  plannedRegistrationCloseAt: new Date("2028-10-31T18:15:00.000Z"),
  year: 2028,
};

function job<T extends object>(data: T) {
  return [{ data, id: "job-1" } as never];
}

describe("Kalakriti notification jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationEdition.mockResolvedValue(edition);
    guardianRecipients.mockResolvedValue(["guardian-1", "guardian-2"]);
    scheduleRecipients.mockResolvedValue(["guardian-1", "volunteer-1"]);
  });

  it("sends registration-open once per active Guardian with the transition revision", async () => {
    await handleNotifyKalakritiRegistrationOpen(
      job({ editionId: edition.id, transitionId: "transition-1" })
    );

    expect(guardianRecipients).toHaveBeenCalledWith(edition.id);
    expect(notifyRegistration).toHaveBeenCalledTimes(2);
    expect(notifyRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: "guardian-1",
        transition: "registration_open",
        transitionRevision: "transition-1",
      })
    );
  });

  it("does not let a planned-close reminder change lifecycle or send after manual close", async () => {
    notificationEdition.mockResolvedValue({
      ...edition,
      lifecycle: "registration_locked",
    });

    await handleRemindKalakritiRegistrationClose(
      job({
        editionId: edition.id,
        plannedRegistrationCloseAt:
          edition.plannedRegistrationCloseAt.getTime(),
      })
    );

    expect(guardianRecipients).not.toHaveBeenCalled();
    expect(notifyRegistration).not.toHaveBeenCalled();
  });

  it("ignores a superseded planned-close reminder", async () => {
    await handleRemindKalakritiRegistrationClose(
      job({
        editionId: edition.id,
        plannedRegistrationCloseAt:
          edition.plannedRegistrationCloseAt.getTime() - 1,
      })
    );

    expect(guardianRecipients).not.toHaveBeenCalled();
    expect(notifyRegistration).not.toHaveBeenCalled();
  });

  it("passes Center and Competition impact to the scoped recipient resolver", async () => {
    const payload = {
      centerIds: ["center-1"],
      competitionIds: ["competition-1"],
      editionId: edition.id,
      revision: "schedule-revision-1",
    };

    await handleNotifyKalakritiScheduleChanged(job(payload));

    expect(scheduleRecipients).toHaveBeenCalledWith(payload);
    expect(notifySchedule).toHaveBeenCalledTimes(2);
    expect(notifySchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: "volunteer-1",
        scheduleRevision: payload.revision,
      })
    );
  });

  it("keeps retry inputs stable for inbox idempotency", async () => {
    const payload = {
      centerIds: ["center-1"],
      competitionIds: ["competition-1"],
      editionId: edition.id,
      revision: "schedule-revision-1",
    };

    await handleNotifyKalakritiScheduleChanged(job(payload));
    await handleNotifyKalakritiScheduleChanged(job(payload));

    expect(notifySchedule.mock.calls.slice(0, 2)).toEqual(
      notifySchedule.mock.calls.slice(2, 4)
    );
  });

  it("sends reactivation without a credential-reset payload", async () => {
    await handleNotifyKalakritiGuardianReactivated(
      job({
        editionId: edition.id,
        membershipId: "membership-1",
        userId: "guardian-1",
      })
    );

    expect(notifyReactivation).toHaveBeenCalledWith({
      editionId: edition.id,
      editionName: edition.name,
      membershipId: "membership-1",
      recipientUserId: "guardian-1",
      year: edition.year,
    });
  });
});
