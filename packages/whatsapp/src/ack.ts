import type { GowaReceipt } from "@pi-dash/db/queries/gowa-message";

const RECEIPT_TYPES = new Set(["delivered", "read"]);

/**
 * The receipt in a GoWA `message.ack` webhook, or null for any other event.
 * WhatsApp sends receipts only to the sender, so these are for messages the
 * gateway sent. Receipt types other than delivered and read (`sender`,
 * `retry`, `played`, ...) are ignored. GoWA's top-level `timestamp` is when
 * WhatsApp sent the receipt; one that doesn't parse falls back to now.
 */
export function receiptFromAck(
  body: unknown,
  now = new Date()
): GowaReceipt | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const { event, payload, timestamp } = body as Record<string, unknown>;
  if (event !== "message.ack" || typeof payload !== "object" || !payload) {
    return null;
  }
  const {
    from,
    ids,
    receipt_type: type,
    sender_display_name: displayName,
  } = payload as Record<string, unknown>;
  if (
    typeof from !== "string" ||
    from === "" ||
    typeof type !== "string" ||
    !RECEIPT_TYPES.has(type) ||
    !Array.isArray(ids)
  ) {
    return null;
  }
  const messageIds = ids.filter(
    (id): id is string => typeof id === "string" && id !== ""
  );
  if (messageIds.length === 0) {
    return null;
  }
  const at = typeof timestamp === "string" ? new Date(timestamp) : now;
  return {
    at: Number.isNaN(at.getTime()) ? now : at,
    displayName:
      typeof displayName === "string" && displayName !== ""
        ? displayName
        : null,
    messageIds,
    personJid: from,
    type: type as GowaReceipt["type"],
  };
}
