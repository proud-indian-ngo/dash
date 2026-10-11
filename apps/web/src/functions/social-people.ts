import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { loadSocialPeople } from "@/lib/social-people";
import { authMiddleware } from "@/middleware/auth";

/** Ids and names for the Social page (`social.manage` or `users.view`). */
export const getSocialPeople = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ ids: z.array(z.string().min(1).max(64)).max(20) }))
  .handler(({ context, data }) => loadSocialPeople(context.session, data.ids));
