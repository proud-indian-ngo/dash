import { uuidv7 } from "uuidv7";

export type RegisterEventEnrollSkipReason =
  | "missing"
  | "cancelled"
  | "started"
  | "archived-edition";

export type RegisterEventEnrollDecision =
  | { kind: "skip"; reason: RegisterEventEnrollSkipReason }
  | { kind: "event-member" }
  | { kind: "kalakriti-unassigned" };

export interface RegisterEventRow {
  cancelledAt: number | null;
  id: string;
  location: string | null;
  managementDomain: string | null;
  name: string;
  startTime: number;
  whatsappGroupId: string | null;
}

export interface RegisterEditionRow {
  id: string;
  lifecycle: string;
  teamEventId: string;
}

export interface RegisterUserRow {
  email: string | null;
  id: string;
  name: string;
  phone: string | null;
}

export interface RegisterEventEnrollDeps {
  enqueueNotifyAddedToEvent: (payload: {
    eventId: string;
    eventName: string;
    location: string | null;
    startTime: number;
    userId: string;
  }) => Promise<void>;
  enqueueWhatsappAddMember: (payload: {
    groupId: string;
    userId: string;
  }) => Promise<void>;
  findEditionByTeamEventId: (
    teamEventId: string
  ) => Promise<RegisterEditionRow | null>;
  findEvent: (eventId: string) => Promise<RegisterEventRow | null>;
  findUser: (userId: string) => Promise<RegisterUserRow | null>;
  persistEnrollWrites: (row: {
    eventMember: {
      addedAt: number;
      eventId: string;
      id: string;
      userId: string;
    };
    volunteerMembership?: {
      createdBy: string;
      editionId: string;
      id: string;
      now: number;
      snapshotEmail: string | null;
      snapshotName: string;
      snapshotPhone: string | null;
      userId: string;
    };
  }) => Promise<"conflict" | "inserted">;
}

export function decideRegisterEventEnroll(input: {
  edition: Pick<RegisterEditionRow, "lifecycle"> | null;
  event: Pick<
    RegisterEventRow,
    "cancelledAt" | "managementDomain" | "startTime"
  > | null;
  now: number;
}): RegisterEventEnrollDecision {
  const { edition, event, now } = input;
  if (!event) {
    return { kind: "skip", reason: "missing" };
  }
  if (event.cancelledAt !== null) {
    return { kind: "skip", reason: "cancelled" };
  }
  if (event.startTime <= now) {
    return { kind: "skip", reason: "started" };
  }

  const isKalakritiLinked =
    event.managementDomain === "kalakriti" || edition !== null;
  if (!isKalakritiLinked) {
    return { kind: "event-member" };
  }
  if (!edition || edition.lifecycle === "archived") {
    return { kind: "skip", reason: "archived-edition" };
  }
  return { kind: "kalakriti-unassigned" };
}

export async function enrollUserOnRegisterEvent(
  deps: RegisterEventEnrollDeps,
  input: { eventId: string; now: number; userId: string }
): Promise<{ reason?: RegisterEventEnrollSkipReason; status: string }> {
  const event = await deps.findEvent(input.eventId);
  const edition = event ? await deps.findEditionByTeamEventId(event.id) : null;
  const decision = decideRegisterEventEnroll({
    edition,
    event,
    now: input.now,
  });
  if (decision.kind === "skip" || !event) {
    return {
      reason: decision.kind === "skip" ? decision.reason : "missing",
      status: "skipped",
    };
  }

  const eventMemberId = uuidv7();
  let volunteerMembership:
    | {
        createdBy: string;
        editionId: string;
        id: string;
        now: number;
        snapshotEmail: string | null;
        snapshotName: string;
        snapshotPhone: string | null;
        userId: string;
      }
    | undefined;

  if (decision.kind === "kalakriti-unassigned" && edition) {
    const volunteer = await deps.findUser(input.userId);
    if (volunteer) {
      volunteerMembership = {
        createdBy: input.userId,
        editionId: edition.id,
        id: uuidv7(),
        now: input.now,
        snapshotEmail: volunteer.email,
        snapshotName: volunteer.name,
        snapshotPhone: volunteer.phone,
        userId: input.userId,
      };
    }
  }

  const memberResult = await deps.persistEnrollWrites({
    eventMember: {
      addedAt: input.now,
      eventId: event.id,
      id: eventMemberId,
      userId: input.userId,
    },
    volunteerMembership,
  });

  if (memberResult === "inserted") {
    if (event.whatsappGroupId) {
      await deps.enqueueWhatsappAddMember({
        groupId: event.whatsappGroupId,
        userId: input.userId,
      });
    }
    await deps.enqueueNotifyAddedToEvent({
      eventId: event.id,
      eventName: event.name,
      location: event.location,
      startTime: event.startTime,
      userId: input.userId,
    });
  }

  return { status: "enrolled" };
}
