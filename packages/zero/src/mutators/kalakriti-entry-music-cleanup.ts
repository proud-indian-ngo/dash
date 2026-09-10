import type { Context } from "../context";
import { zql } from "../schema";
import type { LockableKalakritiTx } from "./kalakriti-row-locks";
import { enqueueDeleteR2Object } from "./submission-helpers";

export async function enqueueEntryMusicCleanup(
  tx: LockableKalakritiTx,
  ctx: Context,
  entryId: string,
  editionId: string
) {
  const files = (await tx.run(
    zql.kalakritiEntryMusic
      .where("entryId", entryId)
      .where("editionId", editionId)
  )) as readonly { objectKey: string }[];
  for (const file of files) {
    enqueueDeleteR2Object(ctx, tx.location, file.objectKey, {
      keyPrefixes: [`kalakriti-music/${editionId}/${entryId}/`],
      meta: { mutator: "kalakritiEntry.remove" },
    });
  }
}
