import { describe, expect, it } from "bun:test";

import { claimantBankAccountScope } from "./bank-account";

const ctx = (permissions: string[]) =>
  ({ permissions, role: "volunteer", userId: "me" }) as never;

describe("claimantBankAccountScope", () => {
  it("lets anyone read their own accounts", () => {
    expect(claimantBankAccountScope(ctx([]), "me")).toBe("me");
  });

  it("lets only claim-for-others holders read someone else's accounts", () => {
    expect(
      claimantBankAccountScope(ctx(["requests.create_for_others"]), "other")
    ).toBe("other");
    expect(
      claimantBankAccountScope(
        ctx(["requests.view_all", "requests.approve", "finance.manage"]),
        "other"
      )
    ).not.toBe("other");
  });

  it("matches nothing for an anonymous viewer", () => {
    expect(claimantBankAccountScope(null, "me")).not.toBe("me");
  });
});
