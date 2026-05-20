import { db } from "@pi-dash/db";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { eventRsvpPoll } from "@pi-dash/db/schema/event-rsvp";
import { team } from "@pi-dash/db/schema/team";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import z from "zod";
import { authMiddleware } from "@/middleware/auth";

export type PostEventRsvpPollResult =
  | { type: "ok" }
  | {
      type: "error";
      code:
        | "unauthorized"
        | "forbidden"
        | "not_found"
        | "not_eligible"
        | "no_whatsapp_group"
        | "poll_exists"
        | "unknown";
    };

export const postEventRsvpPoll = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ eventId: z.string() }))
  .handler(async ({ data, context }): Promise<PostEventRsvpPollResult> => {
    const log = createRequestLogger({
      method: "POST",
      path: "postEventRsvpPoll",
    });
    log.set({ eventId: data.eventId });

    if (!context.session) {
      log.set({ event: "unauthorized" });
      log.emit();
      return { type: "error", code: "unauthorized" };
    }
    const userId = context.session.user.id;
    log.set({ userId });

    const role = context.session.user.role ?? "unoriented_volunteer";
    const perms = await resolvePermissions(role);
    if (!perms.includes("events.edit")) {
      log.set({ event: "forbidden", role });
      log.emit();
      return { type: "error", code: "forbidden" };
    }

    try {
      const eventRow = await db.query.teamEvent.findFirst({
        where: eq(teamEvent.id, data.eventId),
        columns: {
          id: true,
          cancelledAt: true,
          postRsvpPoll: true,
          whatsappGroupId: true,
          teamId: true,
        },
      });

      if (!eventRow) {
        log.set({ event: "not_found" });
        log.emit();
        return { type: "error", code: "not_found" };
      }

      if (eventRow.cancelledAt || !eventRow.postRsvpPoll) {
        log.set({
          event: "not_eligible",
          cancelled: !!eventRow.cancelledAt,
          postRsvpPoll: eventRow.postRsvpPoll,
        });
        log.emit();
        return { type: "error", code: "not_eligible" };
      }

      if (!eventRow.whatsappGroupId) {
        const teamRow = await db.query.team.findFirst({
          where: eq(team.id, eventRow.teamId),
          columns: { whatsappGroupId: true },
        });
        if (!teamRow?.whatsappGroupId) {
          log.set({ event: "no_whatsapp_group" });
          log.emit();
          return { type: "error", code: "no_whatsapp_group" };
        }
      }

      const existing = await db
        .select({ id: eventRsvpPoll.id })
        .from(eventRsvpPoll)
        .where(eq(eventRsvpPoll.eventId, data.eventId))
        .limit(1);
      if (existing.length > 0) {
        log.set({ event: "poll_exists" });
        log.emit();
        return { type: "error", code: "poll_exists" };
      }

      await enqueue("send-single-rsvp-poll", { eventId: data.eventId });
      log.set({ event: "poll_enqueued" });
      log.emit();
      return { type: "ok" };
    } catch (error) {
      log.error(error instanceof Error ? error : String(error));
      log.emit();
      return { type: "error", code: "unknown" };
    }
  });
