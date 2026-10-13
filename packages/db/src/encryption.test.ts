import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("finance-private encryption", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock("@pi-dash/env/server");
  });

  async function load(key: string | undefined) {
    vi.resetModules();
    vi.doMock("@pi-dash/env/server", () => ({
      env: { DATA_ENCRYPTION_KEY: key },
    }));
    return await import("./encryption");
  }

  it("round-trips a value and never stores it in clear", async () => {
    const m = await load(KEY);
    const stored = m.encryptSecret("ABCDE1234F");
    expect(stored.startsWith("v1.")).toBe(true);
    expect(stored).not.toContain("ABCDE1234F");
    expect(m.decryptSecret(stored)).toBe("ABCDE1234F");
    expect(m.encryptSecret("ABCDE1234F")).not.toBe(stored);
    expect(m.last4("ABCDE1234F")).toBe("234F");
    expect(m.hasEncryptionKey()).toBe(true);
  });

  it("rejects tampered values", async () => {
    const m = await load(KEY);
    const stored = m.encryptSecret("1001200034005600");
    const [v, iv, body, tag] = stored.split(".");
    const flipped = `${v}.${iv}.${body}.${tag?.slice(0, -2)}AA`;
    expect(() => m.decryptSecret(flipped)).toThrow();
    expect(() => m.decryptSecret("plain")).toThrow("Unrecognised");
  });

  it("refuses to run without a usable key", async () => {
    const m = await load(undefined);
    expect(m.hasEncryptionKey()).toBe(false);
    expect(() => m.encryptSecret("x")).toThrow("DATA_ENCRYPTION_KEY");
    const short = await load(Buffer.alloc(8).toString("base64"));
    expect(() => short.encryptSecret("x")).toThrow("32 bytes");
  });
});
