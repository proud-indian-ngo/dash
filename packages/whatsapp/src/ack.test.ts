import { describe, expect, it } from "vitest";

import { receiptFromAck } from "./ack";

const NOW = new Date("2026-10-19T10:00:00Z");

const ack = (payload: Record<string, unknown> = {}, extra = {}) => ({
  device_id: "919999999999@s.whatsapp.net",
  event: "message.ack",
  payload: {
    chat_id: "120363402106000000@g.us",
    from: "919876543210@s.whatsapp.net",
    from_lid: "251556368777322@lid",
    ids: ["3EB00106E8BE0F407E88EC"],
    receipt_type: "delivered",
    receipt_type_description: "delivered to the device",
    sender_display_name: "Asha",
    ...payload,
  },
  timestamp: "2026-10-19T09:30:00Z",
  ...extra,
});

describe("receiptFromAck", () => {
  it("reads a delivery receipt", () => {
    expect(receiptFromAck(ack(), NOW)).toEqual({
      at: new Date("2026-10-19T09:30:00Z"),
      displayName: "Asha",
      messageIds: ["3EB00106E8BE0F407E88EC"],
      personJid: "919876543210@s.whatsapp.net",
      type: "delivered",
    });
  });

  it("reads a read receipt for several messages", () => {
    const receipt = receiptFromAck(
      ack({ ids: ["A", "B"], receipt_type: "read" }),
      NOW
    );
    expect(receipt?.type).toBe("read");
    expect(receipt?.messageIds).toEqual(["A", "B"]);
  });

  it("falls back to now without a usable timestamp", () => {
    expect(receiptFromAck(ack({}, { timestamp: "soon" }), NOW)?.at).toEqual(
      NOW
    );
  });

  it("keeps a receipt without a display name", () => {
    expect(
      receiptFromAck(ack({ sender_display_name: undefined }), NOW)?.displayName
    ).toBeNull();
  });

  it.each([
    ["another event", { ...ack(), event: "message" }],
    ["a sender receipt", ack({ receipt_type: "sender" })],
    ["a played receipt", ack({ receipt_type: "played" })],
    ["no ids", ack({ ids: undefined })],
    ["empty ids", ack({ ids: [] })],
    ["no sender", ack({ from: "" })],
    ["no payload", { event: "message.ack" }],
    ["not an object", "message.ack"],
  ])("ignores %s", (_name, body) => {
    expect(receiptFromAck(body, NOW)).toBeNull();
  });
});
