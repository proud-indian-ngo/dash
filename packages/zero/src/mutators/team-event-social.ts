import {
  CHILDREN_ATTENDED_MAX,
  EVENT_PARTNER_LINKEDIN_MAX_LENGTH,
  EVENT_PARTNER_NAME_MAX_LENGTH,
  EVENT_PARTNERS_MAX,
  INSTAGRAM_HANDLE_RE,
  normalizeEventPartner,
  SOCIAL_NOTES_MAX_LENGTH,
  VOLUNTEERS_NEEDED_MAX,
} from "@pi-dash/shared/social-recap";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";

import "../context";
import {
  assertHasPermissionOrTeamLead,
  assertIsLoggedIn,
} from "../permissions";
import type { EventPartner, TeamEvent } from "../schema";
import { zql } from "../schema";
import { assertEventRowNotManagedByKalakriti } from "./kalakriti-event-guard";

/**
 * Event partners for one `team_event` row. Each save sends fresh client ids
 * so a series split or new exception never collides with the source row's
 * partner ids.
 */
export const eventPartnersSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      instagram: z
        .string()
        .trim()
        .regex(INSTAGRAM_HANDLE_RE, "Invalid Instagram handle")
        .or(z.literal(""))
        .nullable()
        .optional(),
      linkedin: z
        .string()
        .trim()
        .max(EVENT_PARTNER_LINKEDIN_MAX_LENGTH)
        .nullable()
        .optional(),
      name: z.string().trim().min(1).max(EVENT_PARTNER_NAME_MAX_LENGTH),
    })
  )
  .max(EVENT_PARTNERS_MAX);

export type EventPartnersArg = z.infer<typeof eventPartnersSchema>;

export const volunteersNeededSchema = z
  .number()
  .int()
  .min(0)
  .max(VOLUNTEERS_NEEDED_MAX)
  .nullable()
  .optional();

abstract class BivariantZeroMutation {
  abstract bivarianceHack(args: unknown): Promise<void>;
}
type ZeroMutationFn = BivariantZeroMutation["bivarianceHack"];
abstract class BivariantZeroRun {
  abstract bivarianceHack(query: unknown): Promise<unknown>;
}
type ZeroRunFn = BivariantZeroRun["bivarianceHack"];

/** Structural tx for partner writes, so callers need not share Zero's deep types. */
export interface PartnerTx {
  mutate: {
    eventPartner: { delete: ZeroMutationFn; insert: ZeroMutationFn };
  };
  run: ZeroRunFn;
}

/**
 * Throw when a client-supplied `team_event` id is already taken. Zero server
 * inserts are ON CONFLICT DO NOTHING, so without this a colliding insert is a
 * silent no-op and later writes keyed on the id (partners, members) would land
 * on the existing, possibly foreign, row.
 */
export async function assertEventIdAvailable(
  tx: { run: ZeroRunFn },
  id: string
) {
  const existing = await tx.run(zql.teamEvent.where("id", id).one());
  if (existing) {
    throw new Error("Event id already exists");
  }
}

/**
 * Replace every partner of `eventId` with `partners`, preserving their order.
 * `teamId` is the team the caller was authorised against; the target row is
 * re-read and must belong to it.
 */
export async function replaceEventPartners(
  tx: PartnerTx,
  eventId: string,
  teamId: string,
  partners: EventPartnersArg,
  now: number
) {
  const ids = new Set(partners.map((partner) => partner.id));
  if (ids.size !== partners.length) {
    throw new Error("Duplicate partner ids");
  }
  const target = (await tx.run(zql.teamEvent.where("id", eventId).one())) as
    | Pick<TeamEvent, "teamId">
    | undefined;
  if (!target || target.teamId !== teamId) {
    throw new Error("Event partners target does not belong to this team");
  }
  const existing = (await tx.run(
    zql.eventPartner.where("eventId", eventId)
  )) as EventPartner[];
  for (const row of existing) {
    await tx.mutate.eventPartner.delete({ id: row.id });
  }
  for (const [index, partner] of partners.entries()) {
    await tx.mutate.eventPartner.insert({
      // Order is creation order; offset so the saved order survives sorting.
      createdAt: now + index,
      eventId,
      id: partner.id,
      ...normalizeEventPartner(partner),
    });
  }
}

async function loadRecapEvent(
  tx: { run: ZeroRunFn },
  ctx: { userId: string },
  eventId: string
) {
  const event = (await tx.run(zql.teamEvent.where("id", eventId).one())) as
    | TeamEvent
    | undefined;
  if (!event) {
    throw new Error("Event not found");
  }
  assertEventRowNotManagedByKalakriti(event);
  const isTeamLead = !!(await tx.run(
    zql.teamMember
      .where("teamId", event.teamId)
      .where("userId", ctx.userId)
      .where("role", "lead")
      .one()
  ));
  return { event, isTeamLead };
}

function assertRecapEligible(event: TeamEvent, now: number) {
  if (event.recurrenceRule && !event.seriesId) {
    throw new Error("Record the recap on a single session, not the series");
  }
  if ((event.endTime ?? event.startTime) > now) {
    throw new Error("The recap opens after the event ends");
  }
}

export const teamEventSocialMutators = {
  /**
   * Save the post-event social recap. `markReady` stamps
   * `social_completed_at` the first time; later saves keep the original
   * stamp so an edit does not move the recap date.
   */
  saveSocialRecap: defineMutator(
    z.object({
      childrenAttended: z
        .number()
        .int()
        .min(0)
        .max(CHILDREN_ATTENDED_MAX)
        .nullable(),
      eventId: z.string(),
      markReady: z.boolean(),
      now: z.number(),
      socialNotes: z.string().trim().max(SOCIAL_NOTES_MAX_LENGTH).nullable(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const { event, isTeamLead } = await loadRecapEvent(tx, ctx, args.eventId);
      assertHasPermissionOrTeamLead(
        ctx,
        "events.manage_attendance",
        isTeamLead
      );
      assertRecapEligible(event, args.now);

      await tx.mutate.teamEvent.update({
        childrenAttended: args.childrenAttended,
        id: args.eventId,
        socialNotes: args.socialNotes || null,
        ...(args.markReady && event.socialCompletedAt === null
          ? { socialCompletedAt: args.now }
          : {}),
        updatedAt: args.now,
      });
    }
  ),

  /** Undo "recap ready": the social API reports the session as scheduled again. */
  undoSocialRecap: defineMutator(
    z.object({ eventId: z.string(), now: z.number() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const { isTeamLead } = await loadRecapEvent(tx, ctx, args.eventId);
      assertHasPermissionOrTeamLead(
        ctx,
        "events.manage_attendance",
        isTeamLead
      );
      await tx.mutate.teamEvent.update({
        id: args.eventId,
        socialCompletedAt: null,
        updatedAt: args.now,
      });
    }
  ),
};
