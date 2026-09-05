import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { canManageKalakritiCredentials } from "@/lib/kalakriti-credential-policy";
import { listKalakritiCredentialsForAdmin } from "@/lib/server/kalakriti-credential";
import { resolveKalakritiEditionAccess } from "@/lib/server/kalakriti-edition-access";
import { authMiddleware } from "@/middleware/auth";

const editionYearSchema = z.object({
  year: z.number().int().min(2000).max(2200),
});

export const getKalakritiCredentialsForAdmin = createServerFn({
  method: "GET",
})
  .middleware([authMiddleware])
  .validator(editionYearSchema)
  .handler(async ({ context, data }) => {
    if (!context.session) {
      return null;
    }
    const access = await resolveKalakritiEditionAccess({
      role: context.session.user.role ?? "unoriented_volunteer",
      userId: context.session.user.id,
      year: data.year,
    });
    if (!(access && canManageKalakritiCredentials(access))) {
      return null;
    }
    return listKalakritiCredentialsForAdmin(access.edition.id);
  });
