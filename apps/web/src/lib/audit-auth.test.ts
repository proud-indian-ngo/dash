import { describe, expect, it } from "vitest";
import {
  getAuditedAuthAction,
  getAuditedAuthChangedFields,
} from "./audit-auth";

describe("authenticated Better Auth audit actions", () => {
  it.each([
    ["/change-password", "account.password.change", ["password"]],
    ["/sign-out", "account.sign_out", ["session"]],
    ["/update-user", "account.profile.update", ["profile"]],
  ])("maps %s to a stable action", (path, action, changedFields) => {
    expect(getAuditedAuthAction(path)).toBe(action);
    expect(getAuditedAuthChangedFields(path)).toEqual(changedFields);
  });

  it("leaves unauthenticated and unrelated auth flows outside the ledger", () => {
    expect(getAuditedAuthAction("/sign-in/email")).toBeUndefined();
    expect(getAuditedAuthChangedFields("/sign-in/email")).toEqual([]);
  });
});
