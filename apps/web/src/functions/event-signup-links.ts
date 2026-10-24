import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { runSessionAuditedAction } from "@/lib/audit";
import { HttpError } from "@/lib/http-error";
import {
  createEventSignupLinkWithDeps,
  eventSignupLinkDeps,
} from "@/lib/server/event-signup-link";
import { authMiddleware } from "@/middleware/auth";

const eventSignupLinkSchema = z.object({ eventId: z.uuid() });

/**
 * Sign an event's sign-up link (`/register?eventId=&sig=`). Audited because
 * the link enrolls whoever signs up with it.
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
        // Never the signature.
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
