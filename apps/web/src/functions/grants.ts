import { db } from "@pi-dash/db";
import {
  type GrantUtilisationRows,
  loadGrantUtilisation,
} from "@pi-dash/db/queries/grant-utilisation";
import { accountHead } from "@pi-dash/db/schema/finance-dimensions";
import { grantAgreement } from "@pi-dash/db/schema/grant";
import { ledgerEntry } from "@pi-dash/db/schema/ledger";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { authMiddleware } from "@/middleware/auth";

export type { GrantUtilisationRows };

/**
 * Money received and spent under grants, from the books and linked
 * contributions, for `from`..`to` (one grant, or all when `grantId` is
 * null). A read, so not audited; grants are written through Zero mutators.
 */
export const getGrantUtilisation = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        from: z.iso.date().nullable(),
        grantId: z.guid().nullable(),
        to: z.iso.date(),
      })
      .refine(
        (v) => !v.from || v.from <= v.to,
        "The range ends before it starts"
      )
  )
  .handler(async ({ context, data }): Promise<GrantUtilisationRows> => {
    await assertServerPermission(context.session, "finance.view");
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
      return await loadGrantUtilisation(tx, {
        from: data.from,
        grantIds: data.grantId ? [data.grantId] : null,
        to: data.to,
      });
    });
  });

/** Posted spend that an event's project change would move between grants. */
export interface EventProjectMove {
  lines: { fromGrant: string | null; paise: number; toGrant: string | null }[];
  postedPaise: number;
}

/**
 * Before finance changes an event's (or a series') project: the cash
 * expense already in the books on it, and between which grants it would
 * move, by each entry's date. The change itself reposts through the expense
 * sweep. A read, so not audited.
 */
export const getEventProjectMove = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      eventId: z.guid(),
      projectId: z.guid().nullable(),
      withSessions: z.boolean(),
    })
  )
  .handler(async ({ context, data }): Promise<EventProjectMove> => {
    await assertServerPermission(context.session, "finance.manage");
    const events = data.withSessions
      ? or(eq(teamEvent.id, data.eventId), eq(teamEvent.seriesId, data.eventId))
      : eq(teamEvent.id, data.eventId);
    const signed = sql<string>`sum(case when ${ledgerEntry.effect} = 'increase' then ${ledgerEntry.amountPaise} else -${ledgerEntry.amountPaise} end)`;
    const rows = await db
      .select({
        day: ledgerEntry.economicOn,
        paise: signed,
        projectId: ledgerEntry.projectId,
      })
      .from(ledgerEntry)
      .innerJoin(teamEvent, eq(teamEvent.id, ledgerEntry.eventId))
      .innerJoin(
        accountHead,
        and(
          eq(accountHead.id, ledgerEntry.accountHeadId),
          eq(accountHead.type, "expense")
        )
      )
      .where(and(events, eq(ledgerEntry.medium, "monetary")))
      .groupBy(ledgerEntry.economicOn, ledgerEntry.projectId);
    const moving = rows
      .map((r) => ({ ...r, paise: Number(r.paise) }))
      .filter((r) => r.paise !== 0 && r.projectId !== data.projectId);
    const projectIds = [
      ...new Set(
        [data.projectId, ...moving.map((r) => r.projectId)].filter(
          (id): id is string => id !== null
        )
      ),
    ];
    const grants =
      projectIds.length > 0
        ? await db
            .select({
              endsOn: grantAgreement.endsOn,
              projectId: grantAgreement.projectId,
              startsOn: grantAgreement.startsOn,
              title: grantAgreement.title,
            })
            .from(grantAgreement)
            .where(inArray(grantAgreement.projectId, projectIds))
        : [];
    const grantOn = (projectId: string | null, day: string) =>
      grants.find(
        (g) => g.projectId === projectId && g.startsOn <= day && day <= g.endsOn
      )?.title ?? null;
    const byPair = new Map<string, EventProjectMove["lines"][number]>();
    for (const row of moving) {
      const fromGrant = grantOn(row.projectId, row.day);
      const toGrant = grantOn(data.projectId, row.day);
      const key = `${fromGrant}\u0000${toGrant}`;
      const line = byPair.get(key) ?? { fromGrant, paise: 0, toGrant };
      line.paise += row.paise;
      byPair.set(key, line);
    }
    return {
      lines: [...byPair.values()].filter((l) => l.paise !== 0),
      postedPaise: moving.reduce((total, r) => total + r.paise, 0),
    };
  });
