import { getPublicSessionSummary as readPublicSessionSummary } from "@pi-dash/db/queries/public-events";
import { createServerFn } from "@tanstack/react-start";
import * as z from "zod";

/** Register-page banner for public-website sign-up links. */
export const getPublicSessionSummary = createServerFn({ method: "GET" })
  .validator(
    z.object({
      eventId: z.uuid(),
      occDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    })
  )
  .handler(({ data }) =>
    readPublicSessionSummary(data.eventId, data.occDate, Date.now())
  );
