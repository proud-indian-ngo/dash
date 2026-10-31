import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/env/server", () => ({
  env: {
    LEEGALITY_API_URL: "https://leegality.test/",
    LEEGALITY_AUTH_TOKEN: "token",
  },
}));

const { createEsignDocument, esignDocumentState } = await import("./leegality");

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });

const signers = [
  {
    box: [300, 600.4, 547, 672] as [number, number, number, number],
    email: "asha@example.org",
    name: "Asha Rao",
    page: 3,
  },
  {
    box: [300, 472, 547, 544] as [number, number, number, number],
    email: "vikram@example.org",
    name: "Vikram Menon",
    page: 3,
  },
];
const input = {
  expiryDays: 7,
  irn: "C-0193ABCD",
  name: "Circular C-0193ABCD",
  pdf: new Uint8Array([1, 2, 3]),
  signers,
};

describe("createEsignDocument", () => {
  it("invites every signer at once to Aadhaar eSign in their own box", async () => {
    const calls: { body: unknown; init: RequestInit; url: string }[] = [];
    const fetcher = mock(async (url: string, init: RequestInit) => {
      calls.push({ body: JSON.parse(String(init.body)), init, url });
      return json({
        data: {
          documentId: "DOC1",
          invitations: [
            { email: "vikram@example.org" },
            { email: "asha@example.org" },
          ],
        },
        status: 1,
      });
    });
    expect(await createEsignDocument(input, fetcher as never)).toBe("DOC1");
    const [call] = calls;
    expect(call?.url).toBe("https://leegality.test/api/v2.1/sign/request");
    expect(call?.init.headers).toMatchObject({ "X-Auth-Token": "token" });
    expect(call?.body).toMatchObject({
      expiryDays: 7,
      file: { file: "AQID", name: "Circular C-0193ABCD" },
      invitees: [
        {
          appearances: [{ page: "3", x1: 300, x2: 547, y1: 600, y2: 672 }],
          email: "asha@example.org",
          name: "Asha Rao",
          signatures: [{ config: { authTypes: ["OTP"] }, type: "AADHAAR" }],
        },
        expect.anything(),
      ],
      irn: "C-0193ABCD",
      requestSignOrder: false,
    });
  });

  it("deletes the document when Leegality left a signer out", async () => {
    const fetcher = mock(async (_url: string, init: RequestInit) =>
      init.method === "DELETE"
        ? json({ data: {}, status: 1 })
        : json({
            data: {
              documentId: "DOC1",
              invitations: [{ email: "asha@example.org" }],
            },
            status: 1,
          })
    );
    await expect(createEsignDocument(input, fetcher as never)).rejects.toThrow(
      "didn't invite every trustee"
    );
    expect(fetcher.mock.calls.at(-1)?.[0]).toBe(
      "https://leegality.test/api/v3.0/sign/request?documentId=DOC1"
    );
  });

  it("asks for a top-up when the balance is low, and reports other refusals as faults", async () => {
    const refusing = (code: string, message: string) =>
      mock(async () =>
        json({ data: {}, messages: [{ code, message }], status: 0 })
      );
    const low = await createEsignDocument(
      input,
      refusing("low.balance", "Insufficient eSign Balance.") as never
    ).catch((error: { fault: boolean; message: string }) => error);
    expect(low).toMatchObject({
      fault: false,
      message: expect.stringContaining("Top it up"),
    });
    const other = await createEsignDocument(
      input,
      refusing("typeMismatch", "Property 1 is type-mismatched") as never
    ).catch((error: { fault: boolean; message: string }) => error);
    expect(other).toMatchObject({
      fault: true,
      message: "Property 1 is type-mismatched",
    });
  });
});

describe("esignDocumentState", () => {
  it("reads each invitation and downloads the current file", async () => {
    const fetcher = mock(async (url: string, _init?: RequestInit) =>
      url.startsWith("https://cdn.test/")
        ? new Response(new Uint8Array([7, 8]))
        : json({
            data: {
              document: { status: "SENT" },
              file: "https://cdn.test/file",
              invitations: [
                {
                  email: "Asha@Example.org",
                  invitationStatus: { signed: true },
                  invitationUrl: "https://leegality.test/sign/a",
                },
              ],
            },
            status: 1,
          })
    );
    const state = await esignDocumentState(
      "DOC1",
      { file: true },
      fetcher as never
    );
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://leegality.test/api/v3.3/document/details?documentId=DOC1&file=true"
    );
    // A JSON content type makes Leegality ignore the query.
    expect(fetcher.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      "Content-Type"
    );
    expect([...(state.file ?? [])]).toEqual([7, 8]);
    expect(state.invitations).toEqual([
      {
        email: "asha@example.org",
        expired: false,
        rejected: false,
        signed: true,
        url: "https://leegality.test/sign/a",
      },
    ]);
  });
});
