import {
  type GowaMessageEntry,
  recordGowaMessage,
} from "@pi-dash/db/queries/gowa-message";
import { createRequestLogger } from "evlog";

/**
 * Logs a GoWA send for the delivery page. Call it once GoWA has accepted
 * the message (or for good failed it); a failed write is logged here and
 * never fails or resends the message. Sends GoWA didn't make (gateway not
 * configured, so no message ID and no error) aren't logged.
 */
export async function logGowaSend(
  entry: GowaMessageEntry,
  messageIds: (string | undefined)[]
): Promise<void> {
  const ids = messageIds.filter((id): id is string => id !== undefined);
  if (ids.length === 0 && !entry.error) {
    return;
  }
  try {
    await recordGowaMessage(entry, ids);
  } catch (error) {
    const log = createRequestLogger({ method: "POST", path: "logGowaSend" });
    log.set({
      event: "gowa_log_failed",
      kind: entry.kind,
      source: entry.source,
    });
    log.error(error instanceof Error ? error : String(error));
    log.emit();
  }
}
