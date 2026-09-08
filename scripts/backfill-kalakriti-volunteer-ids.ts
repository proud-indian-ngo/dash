import { parseBackfillTarget } from "@pi-dash/db/kalakriti-orientation-backfill";
import {
  kalakritiEdition,
  kalakritiEditionMembership,
} from "@pi-dash/db/schema/kalakriti";
import { SQL } from "bun";
import { and, asc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { createRequestLogger } from "evlog";

import { formatKalakritiVolunteerHumanId } from "../packages/shared/src/kalakriti";

export async function backfillKalakritiVolunteerIds(
  database: Pick<ReturnType<typeof drizzle>, "select" | "transaction">,
  options: { apply: boolean; now: number }
) {
  const editions = await database
    .select({ id: kalakritiEdition.id })
    .from(kalakritiEdition)
    .orderBy(asc(kalakritiEdition.id));
  let candidates = 0;
  let updated = 0;
  for (const { id } of editions) {
    const result = await database.transaction(async (tx) => {
      const [edition] = await tx
        .select({
          year: kalakritiEdition.year,
          nextVolunteerSequence: kalakritiEdition.nextVolunteerSequence,
        })
        .from(kalakritiEdition)
        .where(eq(kalakritiEdition.id, id))
        .for("update");
      if (!edition) {
        return 0;
      }
      // Include archived memberships and Editions: these are historical IDs.
      const memberships = await tx
        .select({ id: kalakritiEditionMembership.id })
        .from(kalakritiEditionMembership)
        .where(
          and(
            eq(kalakritiEditionMembership.editionId, id),
            eq(kalakritiEditionMembership.kind, "volunteer"),
            isNull(kalakritiEditionMembership.humanId)
          )
        )
        .orderBy(
          asc(kalakritiEditionMembership.createdAt),
          asc(kalakritiEditionMembership.id)
        );
      if (options.apply && memberships.length > 0) {
        let sequence = edition.nextVolunteerSequence;
        for (const membership of memberships) {
          await tx
            .update(kalakritiEditionMembership)
            .set({
              humanId: formatKalakritiVolunteerHumanId(edition.year, sequence),
              updatedAt: new Date(options.now),
            })
            .where(eq(kalakritiEditionMembership.id, membership.id));
          sequence += 1;
        }
        await tx
          .update(kalakritiEdition)
          .set({ nextVolunteerSequence: sequence })
          .where(eq(kalakritiEdition.id, id));
      }
      return memberships.length;
    });
    candidates += result;
    if (options.apply) {
      updated += result;
    }
  }
  return { candidates, updated };
}

async function main() {
  const log = createRequestLogger({ path: "backfill-kalakriti-volunteer-ids" });
  log.set({ handler: "backfillKalakritiVolunteerIds" });
  let client: SQL | undefined;
  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required");
    }
    const options = parseBackfillTarget(databaseUrl, process.argv.slice(2));
    log.set({
      apply: options.apply,
      local: options.local,
      target: options.target,
    });
    client = new SQL(databaseUrl, { max: 1, connectionTimeout: 5 });
    const result = await backfillKalakritiVolunteerIds(drizzle({ client }), {
      apply: options.apply,
      now: Date.now(),
    });
    log.set(result);
    process.stdout.write(
      `${JSON.stringify({ mode: options.apply ? "apply" : "dry-run", target: options.target, ...result })}\n`
    );
  } catch (error) {
    log.error(error instanceof Error ? error : String(error));
    throw error;
  } finally {
    log.emit();
    await client?.close();
  }
}

if (import.meta.main) {
  main().then(
    () => process.exit(0),
    () => process.exit(1)
  );
}
