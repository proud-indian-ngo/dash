import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createHash } from "node:crypto";

const LATEST = new Uint8Array([1, 2, 3]);
const FILLED = new Uint8Array([1, 2, 3, 4]);
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

type Answer = "assent" | "objection" | "conflict" | "decided";
let state: {
  answers: { answer: Answer; position: number }[];
  fieldName: string;
  openAssents: number;
} | null;
let revision: {
  latestObjectKey: string;
  latestSha256: string;
} | null;
const stored = new Map<string, Uint8Array>();
const fillAnswers = mock(
  async (_input: { name: string; pdf: Uint8Array; value: string }) => FILLED
);

mock.module("@pi-dash/db", () => ({ db: {} }));
mock.module("@pi-dash/env/server", () => ({ env: { R2_KEY_PREFIX: "test" } }));
mock.module("@pi-dash/db/queries/resolutions", () => ({
  currentRevision: async () => revision,
  signerState: async () => state,
}));
mock.module("../s3", () => ({
  getS3: async () => ({
    file: (key: string) => ({
      arrayBuffer: async () =>
        (key === "latest.pdf" ? LATEST : stored.get(key))?.buffer,
      exists: async () => stored.has(key),
      write: async (bytes: Uint8Array) => {
        stored.set(key, bytes);
      },
    }),
  }),
}));
mock.module("./signing-service", () => ({ fillAnswers }));

const { signingCopy } = await import("./signing-copy");

describe("signingCopy", () => {
  beforeEach(() => {
    stored.clear();
    fillAnswers.mockClear();
    state = {
      answers: [
        { answer: "assent", position: 1 },
        { answer: "objection", position: 2 },
      ],
      fieldName: "Trustee_a",
      openAssents: 1,
    };
    revision = {
      latestObjectKey: "latest.pdf",
      latestSha256: sha(LATEST),
    };
  });

  it("fills the trustee's answers into the latest copy once, then reuses it", async () => {
    const copy = await signingCopy("c1", "t1", { create: true });
    expect(copy.answers).toBe("Resolution 1: assents; Resolution 2: objects");
    expect(copy.basedOnSha256).toBe(sha(LATEST));
    expect(copy.bytes).toEqual(FILLED);
    expect(fillAnswers).toHaveBeenCalledWith({
      name: "Answers_t1",
      pdf: LATEST,
      value: "Resolution 1: assents; Resolution 2: objects",
    });
    const again = await signingCopy("c1", "t1", { create: false });
    expect(again.objectKey).toBe(copy.objectKey);
    expect(fillAnswers).toHaveBeenCalledTimes(1);
  });

  it("refuses a stale copy: other answers or a newer latest PDF", async () => {
    await signingCopy("c1", "t1", { create: true });
    state = {
      answers: [
        { answer: "objection", position: 1 },
        { answer: "objection", position: 2 },
      ],
      fieldName: "Trustee_a",
      openAssents: 1,
    };
    await expect(signingCopy("c1", "t1", { create: false })).rejects.toThrow(
      "changed after you started"
    );
  });

  it("refuses when the latest PDF doesn't match its record", async () => {
    revision = {
      latestObjectKey: "latest.pdf",
      latestSha256: "f".repeat(64),
    };
    await expect(signingCopy("c1", "t1", { create: true })).rejects.toThrow(
      "doesn't match its record"
    );
  });

  it("refuses someone the circular didn't go to, or with nothing to sign", async () => {
    state = null;
    await expect(signingCopy("c1", "t1", { create: true })).rejects.toThrow(
      "weren't a trustee"
    );
    state = {
      answers: [{ answer: "decided", position: 1 }],
      fieldName: "Trustee_a",
      openAssents: 0,
    };
    await expect(signingCopy("c1", "t1", { create: true })).rejects.toThrow(
      "nothing left"
    );
  });
});
