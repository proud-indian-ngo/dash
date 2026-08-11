import { beforeEach, describe, expect, it, vi } from "vitest";

const notificationEdition = vi.hoisted(() => vi.fn());
const registrationRecipients = vi.hoisted(() => vi.fn());
const scheduleRecipients = vi.hoisted(() => vi.fn());
const notifyRegistration = vi.hoisted(() => vi.fn(async () => undefined));
const notifySchedule = vi.hoisted(() => vi.fn(async () => undefined));
const notifyReactivation = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../lib/kalakriti-notification-recipients", () => ({
  getKalakritiNotificationEdition: notificationEdition,
  resolveKalakritiRegistrationRecipients: registrationRecipients,
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
  handleNotifyKalakritiRegistrationClosed,
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
    registrationRecipients.mockResolvedValue([
      "guardian-1",
      "guardian-2",
      "volunteer-1",
    ]);
    scheduleRecipients.mockResolvedValue(["guardian-1", "volunteer-1"]);
  });

  it("sends registration-open once per active Guardian or assigned volunteer", async () => {
    await handleNotifyKalakritiRegistrationOpen(
      job({ editionId: edition.id, transitionId: "transition-1" })
    );

    expect(registrationRecipients).toHaveBeenCalledWith(edition.id);
    expect(notifyRegistration).toHaveBeenCalledTimes(3);
    expect(notifyRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: "guardian-1",
        transition: "registration_open",
        transitionRevision: "transition-1",
      })
    );
    expect(notifyRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: "volunteer-1" })
    );
  });

  it("uses the same Edition recipients when registration closes", async () => {
    await handleNotifyKalakritiRegistrationClosed(
      job({ editionId: edition.id, transitionId: "transition-2" })
    );

    expect(registrationRecipients).toHaveBeenCalledWith(edition.id);
    expect(notifyRegistration).toHaveBeenCalledTimes(3);
    expect(notifyRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: "volunteer-1",
        transition: "registration_closed",
        transitionRevision: "transition-2",
      })
    );
  });

  it("uses the same Edition recipients for the planned-close reminder", async () => {
    await handleRemindKalakritiRegistrationClose(
      job({
        editionId: edition.id,
        plannedRegistrationCloseAt:
          edition.plannedRegistrationCloseAt.getTime(),
      })
    );

    expect(registrationRecipients).toHaveBeenCalledWith(edition.id);
    expect(notifyRegistration).toHaveBeenCalledTimes(3);
    expect(notifyRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: "volunteer-1",
        transition: "registration_close_reminder",
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

    expect(registrationRecipients).not.toHaveBeenCalled();
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

    expect(registrationRecipients).not.toHaveBeenCalled();
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

  it("does not resolve or notify recipients for a draft schedule", async () => {
    notificationEdition.mockResolvedValue({ ...edition, lifecycle: "draft" });

    await handleNotifyKalakritiScheduleChanged(
      job({
        centerIds: ["center-1"],
        competitionIds: ["competition-1"],
        editionId: edition.id,
        revision: "draft-revision-1",
      })
    );

    expect(scheduleRecipients).not.toHaveBeenCalled();
    expect(notifySchedule).not.toHaveBeenCalled();
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
