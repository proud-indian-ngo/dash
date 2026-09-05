import { createHash, randomBytes } from "node:crypto";

export interface CredentialPrintSubject {
  membershipId?: string;
  studentId?: string;
}

export function createOpaqueCredentialToken(): {
  token: string;
  tokenHash: string;
} {
  const tokenBytes = randomBytes(32);
  const token = tokenBytes.toString("base64url");
  return {
    token,
    tokenHash: createHash("sha256").update(token, "utf8").digest("hex"),
  };
}

export function assertCredentialPrintSubject(
  subject: CredentialPrintSubject
): void {
  const hasStudent = Boolean(subject.studentId);
  const hasMembership = Boolean(subject.membershipId);
  if (hasStudent === hasMembership) {
    throw new Error("Exactly one credential subject is required");
  }
}
