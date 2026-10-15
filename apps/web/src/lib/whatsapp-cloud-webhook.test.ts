import { describe, expect, it, mock } from "bun:test";
import { createHmac } from "node:crypto";

mock.module("@pi-dash/whatsapp/notify", () => ({
  recordWhatsAppStatus: mock(),
  sendWhatsAppReply: mock(),
}));

import {
  autoReplyIdempotencyKey,
  type CloudWebhook,
  type CloudWebhookDeps,
  cloudWebhookSchema,
  handleCloudWebhookPost,
  isValidCloudSignature,
  processCloudWebhook,
  verifySubscription,
  WHATSAPP_AUTO_REPLY,
} from "./whatsapp-cloud-webhook";

const NOW = Date.parse("2026-10-15T06:30:00Z");
const PHONE_NUMBER_ID = "1234567890";
const APP_SECRET = "app-secret";
const config = { appSecret: APP_SECRET, phoneNumberId: PHONE_NUMBER_ID };

type ReplyOutcome = "sent" | "duplicate" | "no_template" | "rejected";

function createDeps() {
  const recordStatus = mock(async () => true);
  const sendReply = mock(async (): Promise<ReplyOutcome> => "sent");
  const deps: CloudWebhookDeps = { now: () => NOW, recordStatus, sendReply };
  return { deps, recordStatus, sendReply };
}

function rawPayload(
  value: Record<string, unknown>,
  phoneNumberId = PHONE_NUMBER_ID
) {
  return {
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550000000",
                phone_number_id: phoneNumberId,
              },
              ...value,
            },
          },
        ],
        id: "waba",
      },
    ],
    object: "whatsapp_business_account",
  };
}

function payload(
  value: Record<string, unknown>,
  phoneNumberId?: string
): CloudWebhook {
  return cloudWebhookSchema.parse(rawPayload(value, phoneNumberId));
}

describe("isValidCloudSignature", () => {
  const body = '{"object":"whatsapp_business_account"}';
  const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;

  it("accepts Meta's HMAC of the raw body", () => {
    expect(isValidCloudSignature(body, signature, "secret")).toBe(true);
  });

  it("rejects a missing or wrong signature", () => {
    expect(isValidCloudSignature(body, null, "secret")).toBe(false);
    expect(isValidCloudSignature(body, signature, "other")).toBe(false);
    expect(isValidCloudSignature(`${body} `, signature, "secret")).toBe(false);
  });
});

describe("verifySubscription", () => {
  const url = (token: string) =>
    new URL(
      `https://dash.example.org/api/whatsapp/cloud/webhook?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=12345`
    );

  it("echoes the challenge when the token matches", async () => {
    const response = verifySubscription(url("right"), "right");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("12345");
  });

  it("refuses a wrong token or an unconfigured route", () => {
    expect(verifySubscription(url("wrong"), "right").status).toBe(403);
    expect(verifySubscription(url("right"), undefined).status).toBe(403);
  });
});

describe("processCloudWebhook", () => {
  it("records delivery statuses with Meta's error", async () => {
    const { deps, recordStatus } = createDeps();
    const result = await processCloudWebhook(
      payload({
        statuses: [
          { id: "wamid.1", status: "delivered" },
          {
            errors: [{ code: 131_026, title: "Message undeliverable" }],
            id: "wamid.2",
            status: "failed",
          },
          { id: "wamid.3", status: "deleted" },
        ],
      }),
      config,
      deps
    );
    expect(recordStatus).toHaveBeenCalledTimes(2);
    expect(recordStatus).toHaveBeenCalledWith(
      "wamid.1",
      "delivered",
      undefined
    );
    expect(recordStatus).toHaveBeenCalledWith(
      "wamid.2",
      "failed",
      "131026 Message undeliverable"
    );
    expect(result.statuses).toBe(2);
  });

  it("auto-replies once per sender per India day without keeping the number", async () => {
    const { deps, sendReply } = createDeps();
    const result = await processCloudWebhook(
      payload({
        messages: [{ from: "919876543210", id: "wamid.in", type: "text" }],
      }),
      config,
      deps
    );
    expect(result).toEqual({
      autoReplies: 1,
      incoming: 1,
      skippedChanges: 0,
      statuses: 0,
    });
    const [phone, text, options] = sendReply.mock.calls[0] as unknown as [
      string,
      string,
      { idempotencyKey: string },
    ];
    expect(phone).toBe("919876543210");
    expect(text).toBe(WHATSAPP_AUTO_REPLY);
    expect(options.idempotencyKey).toMatch(
      /^auto-reply-[0-9a-f]{16}-2026-10-15$/
    );
    expect(options.idempotencyKey).not.toContain("9876543210");
    expect(options.idempotencyKey).toBe(
      `auto-reply-${createHmac("sha256", APP_SECRET).update("919876543210").digest("hex").slice(0, 16)}-2026-10-15`
    );
  });

  it("keys the auto-reply with an HMAC, not a plain hash of the number", () => {
    const key = autoReplyIdempotencyKey("919876543210", APP_SECRET, NOW);
    expect(key).not.toBe(
      autoReplyIdempotencyKey("919876543210", "other-secret", NOW)
    );
    expect(autoReplyIdempotencyKey("919876543210", APP_SECRET, NOW)).toBe(key);
  });

  it.each(["no_template", "rejected"] as const)(
    "doesn't count a %s auto-reply as sent",
    async (outcome) => {
      const { deps, sendReply } = createDeps();
      sendReply.mockImplementation(async () => outcome);
      const result = await processCloudWebhook(
        payload({
          messages: [{ from: "91987", id: "wamid.in", type: "text" }],
        }),
        config,
        deps
      );
      expect(result.autoReplies).toBe(0);
      expect(result.incoming).toBe(1);
    }
  );

  it("skips changes for another phone number", async () => {
    const { deps, recordStatus, sendReply } = createDeps();
    const result = await processCloudWebhook(
      payload(
        {
          messages: [{ from: "91987", id: "wamid.in", type: "text" }],
          statuses: [{ id: "wamid.1", status: "delivered" }],
        },
        "9999999999"
      ),
      config,
      deps
    );
    expect(result).toEqual({
      autoReplies: 0,
      incoming: 0,
      skippedChanges: 1,
      statuses: 0,
    });
    expect(recordStatus).not.toHaveBeenCalled();
    expect(sendReply).not.toHaveBeenCalled();
  });

  it("processes nothing when no phone number is configured", async () => {
    const { deps, recordStatus, sendReply } = createDeps();
    const result = await processCloudWebhook(
      payload({
        messages: [{ from: "91987", id: "wamid.in", type: "text" }],
        statuses: [{ id: "wamid.1", status: "delivered" }],
      }),
      { appSecret: APP_SECRET, phoneNumberId: undefined },
      deps
    );
    expect(result.skippedChanges).toBe(1);
    expect(recordStatus).not.toHaveBeenCalled();
    expect(sendReply).not.toHaveBeenCalled();
  });

  it("counts a repeat sender without replying again", async () => {
    const { deps, sendReply } = createDeps();
    sendReply.mockImplementation(async () => "duplicate" as const);
    const result = await processCloudWebhook(
      payload({ messages: [{ from: "91987", id: "wamid.in", type: "text" }] }),
      config,
      deps
    );
    expect(result).toEqual({
      autoReplies: 0,
      incoming: 1,
      skippedChanges: 0,
      statuses: 0,
    });
  });

  it("ignores other webhook fields", async () => {
    const { deps, recordStatus, sendReply } = createDeps();
    await processCloudWebhook(
      cloudWebhookSchema.parse({
        entry: [
          {
            changes: [
              {
                field: "message_template_status_update",
                value: { event: "APPROVED" },
              },
            ],
          },
        ],
        object: "whatsapp_business_account",
      }),
      config,
      deps
    );
    expect(recordStatus).not.toHaveBeenCalled();
    expect(sendReply).not.toHaveBeenCalled();
  });
});

describe("handleCloudWebhookPost", () => {
  function signedRequest(body: string, secret = APP_SECRET) {
    return new Request("https://dash.example.org/api/whatsapp/cloud/webhook", {
      body,
      headers: {
        "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
      },
      method: "POST",
    });
  }

  it("returns 404 when the app secret isn't configured", async () => {
    const { deps } = createDeps();
    const response = await handleCloudWebhookPost(
      signedRequest("{}"),
      { appSecret: undefined, phoneNumberId: PHONE_NUMBER_ID },
      deps
    );
    expect(response.status).toBe(404);
  });

  it("returns 401 for a bad signature", async () => {
    const { deps } = createDeps();
    const response = await handleCloudWebhookPost(
      signedRequest("{}", "wrong-secret"),
      config,
      deps
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    const { deps } = createDeps();
    const response = await handleCloudWebhookPost(
      signedRequest("{not json"),
      config,
      deps
    );
    expect(response.status).toBe(400);
  });

  it("acknowledges an unsupported payload with 200", async () => {
    const { deps, recordStatus } = createDeps();
    const response = await handleCloudWebhookPost(
      signedRequest(JSON.stringify({ object: "page", entry: [] })),
      config,
      deps
    );
    expect(response.status).toBe(200);
    expect(recordStatus).not.toHaveBeenCalled();
  });

  it("returns 200 after processing", async () => {
    const { deps, recordStatus } = createDeps();
    const response = await handleCloudWebhookPost(
      signedRequest(
        JSON.stringify(
          rawPayload({ statuses: [{ id: "wamid.1", status: "read" }] })
        )
      ),
      config,
      deps
    );
    expect(response.status).toBe(200);
    expect(recordStatus).toHaveBeenCalledWith("wamid.1", "read", undefined);
  });

  it("returns 500 so Meta retries when processing throws", async () => {
    const { deps, recordStatus } = createDeps();
    recordStatus.mockImplementation(async () => {
      throw new Error("database down");
    });
    const response = await handleCloudWebhookPost(
      signedRequest(
        JSON.stringify(
          rawPayload({ statuses: [{ id: "wamid.1", status: "read" }] })
        )
      ),
      config,
      deps
    );
    expect(response.status).toBe(500);
  });
});
