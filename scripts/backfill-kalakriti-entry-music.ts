import { parseBackfillTarget } from "@pi-dash/db/kalakriti-orientation-backfill";
import {
  kalakritiCompetitionEntry,
  kalakritiEdition,
  kalakritiEntryMusic,
} from "@pi-dash/db/schema/kalakriti";
import { SQL } from "bun";
import { asc, eq, isNotNull, and, ne, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { createRequestLogger } from "evlog";

import {
  ALLOWED_KALAKRITI_MUSIC_TYPES,
  MAX_KALAKRITI_MUSIC_SIZE_BYTES,
} from "../packages/shared/src/constants";

export async function backfillKalakritiEntryMusic(
  database: Pick<ReturnType<typeof drizzle>, "select" | "transaction">,
  options: { apply: boolean }
) {
  const editions = await database
    .select({ id: kalakritiEdition.id })
    .from(kalakritiEdition)
    .orderBy(asc(kalakritiEdition.id));
  let candidates = 0;
  let updated = 0;
  const malformedIds: string[] = [];
  for (const { id } of editions) {
    await database.transaction(async (tx) => {
      await tx
        .select({ id: kalakritiEdition.id })
        .from(kalakritiEdition)
        .where(eq(kalakritiEdition.id, id))
        .for("update");
      const entries = await tx
        .select()
        .from(kalakritiCompetitionEntry)
        .where(
          and(
            eq(kalakritiCompetitionEntry.editionId, id),
            isNotNull(kalakritiCompetitionEntry.musicObjectKey)
          )
        )
        .for("update");
      for (const entry of entries) {
        const {
          musicObjectKey: objectKey,
          musicFileName: fileName,
          musicMimeType: mimeType,
          musicByteSize: byteSize,
          musicUploadedAt: uploadedAt,
          musicUploadedBy: uploadedBy,
        } = entry;
        const files = await tx
          .select()
          .from(kalakritiEntryMusic)
          .where(
            or(
              eq(kalakritiEntryMusic.entryId, entry.id),
              eq(kalakritiEntryMusic.id, entry.id),
              ...(objectKey
                ? [eq(kalakritiEntryMusic.objectKey, objectKey)]
                : [])
            )
          );
        const duplicateLegacyKeys = objectKey
          ? await tx
              .select({ id: kalakritiCompetitionEntry.id })
              .from(kalakritiCompetitionEntry)
              .where(
                and(
                  eq(kalakritiCompetitionEntry.musicObjectKey, objectKey),
                  ne(kalakritiCompetitionEntry.id, entry.id)
                )
              )
          : [];
        if (
          !objectKey ||
          objectKey.split("/").includes("tmp") ||
          !fileName ||
          !mimeType ||
          !(ALLOWED_KALAKRITI_MUSIC_TYPES as readonly string[]).includes(
            mimeType
          ) ||
          !byteSize ||
          byteSize > MAX_KALAKRITI_MUSIC_SIZE_BYTES ||
          byteSize < 1 ||
          !uploadedAt ||
          !uploadedBy ||
          files.length > 0 ||
          duplicateLegacyKeys.length > 0
        ) {
          malformedIds.push(entry.id);
          continue;
        }
        candidates++;
        if (!options.apply) continue;
        const inserted = await tx
          .insert(kalakritiEntryMusic)
          .values({
            id: entry.id,
            editionId: id,
            entryId: entry.id,
            slot: 1,
            objectKey,
            fileName,
            mimeType,
            byteSize,
            uploadedAt,
            uploadedBy,
          })
          .onConflictDoNothing()
          .returning({ id: kalakritiEntryMusic.id });
        // A concurrent claimant can win a global key/ID after the preflight.
        // Keep the singleton intact and report it instead of aborting the batch.
        if (inserted.length === 0) {
          candidates--;
          malformedIds.push(entry.id);
          continue;
        }
        await tx
          .update(kalakritiCompetitionEntry)
          .set({
            musicObjectKey: null,
            musicFileName: null,
            musicMimeType: null,
            musicByteSize: null,
            musicUploadedAt: null,
            musicUploadedBy: null,
          })
          .where(eq(kalakritiCompetitionEntry.id, entry.id));
        updated++;
      }
    });
  }
  return { candidates, updated, malformedIds };
}

async function main() {
  const log = createRequestLogger({ path: "backfill-kalakriti-entry-music" });
  log.set({ handler: "backfillKalakritiEntryMusic" });
  let client: SQL | undefined;
  try {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");
    const options = parseBackfillTarget(url, process.argv.slice(2));
    log.set({ apply: options.apply, target: options.target });
    client = new SQL(url, { max: 1, connectionTimeout: 5 });
    const result = await backfillKalakritiEntryMusic(
      drizzle({ client }),
      options
    );
    log.set({
      candidates: result.candidates,
      updated: result.updated,
      malformedCount: result.malformedIds.length,
    });
    process.stdout.write(
      `${JSON.stringify({ target: options.target, ...result })}\n`
    );
    if (result.malformedIds.length)
      throw new Error("Legacy music requires repair before cutover");
  } catch (error) {
    log.error(error instanceof Error ? error : String(error));
    throw error;
  } finally {
    log.emit();
    await client?.close();
  }
}
if (import.meta.main)
  main().then(
    () => process.exit(0),
    () => process.exit(1)
  );
