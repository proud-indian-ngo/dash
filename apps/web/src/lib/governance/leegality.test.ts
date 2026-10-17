import { describe, expect, it } from "bun:test";

import {
  createEsignRequest,
  fetchSignedFile,
  type LeegalityConfig,
  leegalityMac,
  leegalityWebhook,
  verifyLeegalityMac,
} from "./leegality";

const config: LeegalityConfig = {
  apiUrl: "https://sandbox.leegality.com/api",
  authToken: "token-1",
  privateSalt: "salt-1",
  profileId: "7WMVrYf",
};

type Call = { body: unknown; headers: Headers; method: string; url: string };

function fakeFetch(replies: ((url: string) => Response)[]) {
  const calls: Call[] = [];
  const fetcher = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = String(input);
    calls.push({
      body: init?.body ? JSON.parse(String(init.body)) : null,
      headers: new Headers(init?.headers),
      method: init?.method ?? "GET",
      url,
    });
    const reply = replies.shift();
    if (!reply) {
      throw new Error(`Unexpected fetch ${url}`);
    }
    return reply(url);
  }) as typeof fetch;
  return { calls, fetcher };
}

describe("webhook MAC", () => {
  it("is HMAC-SHA1 of the document ID keyed with the salt, in hex", () => {
    const mac = leegalityMac("01KMFEE9T8WPY0WPWXQHQ7DTJ2", "salt-1");
    expect(mac).toMatch(/^[0-9a-f]{40}$/);
    expect(
      verifyLeegalityMac("01KMFEE9T8WPY0WPWXQHQ7DTJ2", mac, "salt-1")
    ).toBe(true);
    expect(
      verifyLeegalityMac(
        "01KMFEE9T8WPY0WPWXQHQ7DTJ2",
        mac.toUpperCase(),
        "salt-1"
      )
    ).toBe(true);
  });

  it("refuses another document, another salt or no MAC", () => {
    const mac = leegalityMac("doc-a", "salt-1");
    expect(verifyLeegalityMac("doc-b", mac, "salt-1")).toBe(false);
    expect(verifyLeegalityMac("doc-a", mac, "salt-2")).toBe(false);
    expect(verifyLeegalityMac("doc-a", null, "salt-1")).toBe(false);
    expect(verifyLeegalityMac("doc-a", "not-hex", "salt-1")).toBe(false);
  });

  it("reads the fields it needs from a payload", () => {
    expect(
      leegalityWebhook.safeParse({
        documentId: "01KMFEE9T8WPY0WPWXQHQ7DTJ2",
        documentStatus: "Completed",
        irn: null,
        mac: "6b736eb163fba3983a0348bc05ffad62a6cbaea1",
        messages: [],
        webhookType: "Success",
      }).success
    ).toBe(true);
  });
});

describe("createEsignRequest", () => {
  it("sends the PDF and one signer to the workflow and returns the link", async () => {
    const { calls, fetcher } = fakeFetch([
      () =>
        Response.json({
          data: {
            documentId: "DOC1",
            invitees: [
              { email: "asha@example.org", signUrl: "https://sign/1" },
            ],
          },
          messages: [],
          status: 1,
        }),
    ]);
    const result = await createEsignRequest(
      {
        fileName: "Circular C-1.pdf",
        irn: "C-1-abc",
        pdf: new Uint8Array([37, 80, 68, 70]),
        signer: {
          aadhaarLast4: "1234",
          email: "asha@example.org",
          name: "ASHA RAO",
          phone: "9876543210",
        },
      },
      config,
      fetcher
    );
    expect(result).toEqual({ documentId: "DOC1", signUrl: "https://sign/1" });
    const [call] = calls;
    expect(call?.url).toBe(
      "https://sandbox.leegality.com/api/v3.0/sign/request"
    );
    expect(call?.headers.get("X-Auth-Token")).toBe("token-1");
    expect(call?.body).toEqual({
      file: { file: "JVBERg==", name: "Circular C-1.pdf" },
      invitees: [
        {
          aadhaarConfig: { verifyTitle: "1234" },
          email: "asha@example.org",
          name: "ASHA RAO",
          phone: "9876543210",
        },
      ],
      irn: "C-1-abc",
      profileId: "7WMVrYf",
    });
  });

  it("passes Leegality's refusal on", async () => {
    const { fetcher } = fakeFetch([
      () =>
        Response.json({
          data: {},
          messages: [{ code: "x", message: "Insufficient wallet balance." }],
          status: 0,
        }),
    ]);
    await expect(
      createEsignRequest(
        {
          fileName: "c.pdf",
          irn: "c",
          pdf: new Uint8Array([1]),
          signer: { aadhaarLast4: null, email: null, name: "A", phone: null },
        },
        config,
        fetcher
      )
    ).rejects.toThrow("Insufficient wallet balance.");
  });
});

describe("Leegality refusing the token", () => {
  it("says the setup needs fixing", async () => {
    const { fetcher } = fakeFetch([
      () => new Response("Unauthorized", { status: 401 }),
    ]);
    await expect(fetchSignedFile("DOC1", config, fetcher)).rejects.toThrow(
      "refused the dashboard's API token"
    );
  });
});

describe("fetchSignedFile", () => {
  const details = (data: unknown) => () => Response.json({ data, status: 1 });

  it("waits while the signer hasn't signed, and reports an expired link", async () => {
    const pending = fakeFetch([
      details({
        document: { status: "SENT" },
        file: null,
        invitations: [{ invitationStatus: { expired: false, signed: false } }],
      }),
    ]);
    expect(await fetchSignedFile("DOC1", config, pending.fetcher)).toEqual({
      kind: "pending",
    });
    expect(pending.calls[0]?.url).toBe(
      "https://sandbox.leegality.com/api/v3.3/document/details?documentId=DOC1&file=true"
    );
    const expired = fakeFetch([
      details({
        document: { status: "SENT" },
        invitations: [{ invitationStatus: { expired: true, signed: false } }],
      }),
    ]);
    expect(await fetchSignedFile("DOC1", config, expired.fetcher)).toEqual({
      kind: "ended",
      reason: "expired",
    });
  });

  it("downloads the signed file from its short-lived link", async () => {
    const { calls, fetcher } = fakeFetch([
      details({
        document: { status: "COMPLETED" },
        file: "https://cdn.leegality.com/signed.pdf",
        invitations: [{ invitationStatus: { signed: true } }],
      }),
      () => new Response(new Uint8Array([1, 2, 3])),
    ]);
    const result = await fetchSignedFile("DOC1", config, fetcher);
    expect(result).toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      kind: "signed",
    });
    expect(calls[1]?.url).toBe("https://cdn.leegality.com/signed.pdf");
    expect(calls[1]?.headers.get("X-Auth-Token")).toBeNull();
  });
});
