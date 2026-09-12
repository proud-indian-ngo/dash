import { parseGuardianIdBackfillOptions } from "@pi-dash/db/kalakriti-guardian-id-backfill";
import { planKalakritiGuardianIds } from "@pi-dash/db/kalakriti-guardian-id-plan";
import {
  kalakritiEdition,
  kalakritiEditionMembership,
} from "@pi-dash/db/schema/kalakriti";
import { SQL } from "bun";
import { and, asc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { createRequestLogger } from "evlog";

// This explicit maintenance script requires the Guardian counter migration first.
export async function backfillKalakritiGuardianIds(
  database: Pick<ReturnType<typeof drizzle>, "transaction">,
  options: { editionId: string; apply: boolean; now: number }
) {
  return database.transaction(async (tx) => {
    const [edition] = await tx
      .select({
        year: kalakritiEdition.year,
        nextGuardianSequence: kalakritiEdition.nextGuardianSequence,
      })
      .from(kalakritiEdition)
      .where(eq(kalakritiEdition.id, options.editionId))
      .for("update");
    if (!edition) throw new Error("Edition not found");
    const memberships = await tx
      .select({
        id: kalakritiEditionMembership.id,
        humanId: kalakritiEditionMembership.humanId,
        kind: kalakritiEditionMembership.kind,
        state: kalakritiEditionMembership.state,
      })
      .from(kalakritiEditionMembership)
      .where(eq(kalakritiEditionMembership.editionId, options.editionId))
      .orderBy(
        asc(kalakritiEditionMembership.createdAt),
        asc(kalakritiEditionMembership.id)
      );
    const missing = memberships.filter(
      (membership) =>
        membership.kind === "guardian" &&
        membership.state === "active" &&
        membership.humanId === null
    );
    const plan = planKalakritiGuardianIds({
      year: edition.year,
      nextGuardianSequence: edition.nextGuardianSequence,
      existingHumanIds: memberships.map((membership) => membership.humanId),
      count: missing.length,
    });
    let updated = 0;
    if (options.apply && missing.length) {
      for (const [index, membership] of missing.entries()) {
        const changed = await tx
          .update(kalakritiEditionMembership)
          .set({
            humanId: plan.humanIds[index]!,
            updatedAt: new Date(options.now),
          })
          .where(
            and(
              eq(kalakritiEditionMembership.id, membership.id),
              eq(kalakritiEditionMembership.editionId, options.editionId),
              eq(kalakritiEditionMembership.kind, "guardian"),
              eq(kalakritiEditionMembership.state, "active"),
              isNull(kalakritiEditionMembership.humanId)
            )
          )
          .returning({ id: kalakritiEditionMembership.id });
        updated += changed.length;
      }
      await tx
        .update(kalakritiEdition)
        .set({ nextGuardianSequence: plan.nextGuardianSequence })
        .where(eq(kalakritiEdition.id, options.editionId));
    }
    return { candidates: missing.length, updated };
  });
}

async function main() {
  const log = createRequestLogger({ path: "backfill-kalakriti-guardian-ids" });
  log.set({ handler: "backfillKalakritiGuardianIds" });
  let client: SQL | undefined;
  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const options = parseGuardianIdBackfillOptions(
      databaseUrl,
      process.argv.slice(2)
    );
    log.set({
      editionId: options.editionId,
      apply: options.apply,
      local: options.local,
      target: options.target,
    });
    client = new SQL(databaseUrl, { max: 1, connectionTimeout: 5 });
    const result = await backfillKalakritiGuardianIds(drizzle({ client }), {
      ...options,
      now: Date.now(),
    });
    log.set(result);
    process.stdout.write(
      `${JSON.stringify({ editionId: options.editionId, mode: options.apply ? "apply" : "dry-run", target: options.target, ...result })}\n`
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
