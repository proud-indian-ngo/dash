import { db } from "@pi-dash/db";
import {
  loadOutcomeRows,
  loadOutcomeSeriesParents,
} from "@pi-dash/db/queries/outcomes";
import { getAppConfigValues } from "@pi-dash/db/queries/social-api";
import { programme } from "@pi-dash/db/schema/finance-dimensions";
import { team } from "@pi-dash/db/schema/team";
import {
  parseVolunteerHourValue,
  summarizeOutcomes,
  unsavedSessionRows,
  VOLUNTEER_HOUR_VALUE_CONFIG_KEY,
} from "@pi-dash/shared/outcomes";
import { createServerFn } from "@tanstack/react-start";
import { asc } from "drizzle-orm";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { authMiddleware } from "@/middleware/auth";

const instant = z.iso.datetime().nullable();

/**
 * Outcomes in Analytics (`requests.view_all`, as the page): children reached
 * and volunteer time over held events, with the programme and team lists
 * for its filters. A read, so not audited.
 */
export const getOutcomes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      costCentreId: z.uuid().nullable(),
      from: instant,
      programmeId: z.uuid().nullable(),
      teamId: z.uuid().nullable(),
      to: instant,
    })
  )
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "requests.view_all");
    const filters = {
      costCentreId: data.costCentreId,
      from: data.from ? new Date(data.from) : null,
      now: new Date(),
      programmeId: data.programmeId,
      teamId: data.teamId,
      to: data.to ? new Date(data.to) : null,
    };
    const [rows, parents, config, programmes, teams] = await Promise.all([
      loadOutcomeRows(filters),
      loadOutcomeSeriesParents(filters),
      getAppConfigValues([VOLUNTEER_HOUR_VALUE_CONFIG_KEY]),
      db
        .select({ id: programme.id, name: programme.name })
        .from(programme)
        .orderBy(asc(programme.sortOrder), asc(programme.name)),
      db
        .select({ id: team.id, name: team.name })
        .from(team)
        .orderBy(asc(team.name)),
    ]);
    return {
      programmes,
      summary: summarizeOutcomes(
        [
          ...rows,
          ...unsavedSessionRows(
            parents,
            {
              from: filters.from?.getTime() ?? null,
              to: filters.to?.getTime() ?? null,
            },
            filters.now.getTime()
          ),
        ],
        parseVolunteerHourValue(config.get(VOLUNTEER_HOUR_VALUE_CONFIG_KEY))
      ),
      teams,
    };
  });
