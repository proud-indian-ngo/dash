import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { runSessionAuditedAction } from "@/lib/audit";
import { HttpError } from "@/lib/http-error";
import {
  createEventSignupLinkWithDeps,
  eventSignupLinkDeps,
  turnOffEventSignupLinkWithDeps,
} from "@/lib/server/event-signup-link";
import { authMiddleware } from "@/middleware/auth";

const eventSignupLinkSchema = z.object({ eventId: z.uuid() });

/**
 * Create an event's sign-up link (`/register?eventInvite=`), replacing the
 * previous one. Returns the raw token once; only its hash is stored.
 */
export const createEventSignupLinkFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(eventSignupLinkSchema)
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "event.signup_link.create",
        // Never the raw token.
        target: { id: data.eventId, type: "event" },
      },
      async () =>
        await createEventSignupLinkWithDeps(
          session,
          data.eventId,
          Date.now(),
          eventSignupLinkDeps
        )
    );
  });

export const turnOffEventSignupLinkFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(eventSignupLinkSchema)
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "event.signup_link.turn_off",
        target: { id: data.eventId, type: "event" },
      },
      async () =>
        await turnOffEventSignupLinkWithDeps(
          session,
          data.eventId,
          eventSignupLinkDeps
        )
    );
  });
