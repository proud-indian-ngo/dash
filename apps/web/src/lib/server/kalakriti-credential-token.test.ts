import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

import {
  assertCredentialPrintSubject,
  createOpaqueCredentialToken,
} from "./kalakriti-credential-token";

describe("createOpaqueCredentialToken", () => {
  it("stores the SHA-256 hash of the UTF-8 QR token string", () => {
    const { token, tokenHash } = createOpaqueCredentialToken();
    expect(createHash("sha256").update(token, "utf8").digest("hex")).toBe(
      tokenHash
    );
  });
});

describe("assertCredentialPrintSubject", () => {
  it("rejects subjects with both identifiers set", () => {
    expect(() =>
      assertCredentialPrintSubject({
        membershipId: "membership-1",
        studentId: "student-1",
      })
    ).toThrow("Exactly one credential subject is required");
  });

  it("rejects subjects with neither identifier set", () => {
    expect(() => assertCredentialPrintSubject({})).toThrow(
      "Exactly one credential subject is required"
    );
  });
});
