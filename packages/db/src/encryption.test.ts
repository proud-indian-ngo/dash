import { afterEach, describe, expect, it, vi } from "vitest";

const KEY = Buffer.alloc(32, 7).toString("base64");
const CTX = "party_private.id_number:p1";

async function load(key: string | undefined) {
  vi.resetModules();
  vi.doMock("@pi-dash/env/server", () => ({
    env: { DATA_ENCRYPTION_KEY: key },
  }));
  return await import("./encryption");
}

describe("finance-private encryption", () => {
  afterEach(() => {
    vi.doUnmock("@pi-dash/env/server");
  });

  it("round-trips a value, never stores it in clear, and uses a fresh IV", async () => {
    const m = await load(KEY);
    const stored = m.encryptSecret("ABCDE1234F", CTX);
    expect(stored.startsWith("v1.")).toBe(true);
    expect(stored).not.toContain("ABCDE1234F");
    expect(m.decryptSecret(stored, CTX)).toBe("ABCDE1234F");
    expect(m.encryptSecret("ABCDE1234F", CTX)).not.toBe(stored);
    expect(m.hasEncryptionKey()).toBe(true);
  });

  it("binds the value to its row and rejects tampering", async () => {
    const m = await load(KEY);
    const stored = m.encryptSecret("1001200034005600", CTX);
    expect(() =>
      m.decryptSecret(stored, "party_private.id_number:p2")
    ).toThrow();
    const [v, iv, body, tag] = stored.split(".") as [
      string,
      string,
      string,
      string,
    ];
    const flippedTag = Buffer.from(tag, "base64url");
    flippedTag[0] = (flippedTag[0] as number) ^ 0xff;
    expect(() =>
      m.decryptSecret(
        `${v}.${iv}.${body}.${flippedTag.toString("base64url")}`,
        CTX
      )
    ).toThrow();
    const flippedBody = Buffer.from(body, "base64url");
    flippedBody[0] = (flippedBody[0] as number) ^ 0xff;
    expect(() =>
      m.decryptSecret(
        `${v}.${iv}.${flippedBody.toString("base64url")}.${tag}`,
        CTX
      )
    ).toThrow();
    expect(() => m.decryptSecret("plain", CTX)).toThrow("Unrecognised");
    expect(() =>
      m.decryptSecret(`v1.${iv.slice(2)}.${body}.${tag}`, CTX)
    ).toThrow("Unrecognised");
  });

  it("refuses to run without a usable key", async () => {
    const m = await load(undefined);
    expect(m.hasEncryptionKey()).toBe(false);
    expect(() => m.encryptSecret("x", CTX)).toThrow("DATA_ENCRYPTION_KEY");
    const short = await load(Buffer.alloc(8).toString("base64"));
    expect(short.hasEncryptionKey()).toBe(false);
    expect(() => short.encryptSecret("x", CTX)).toThrow("32 bytes");
  });

  it("shows a tail only for values long enough to stay masked", async () => {
    const m = await load(KEY);
    expect(m.visibleTail("ABCDE1234F")).toBe("234F");
    expect(m.visibleTail("1234567")).toBeNull();
  });
});
