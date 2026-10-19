import { describe, expect, it } from "vitest";

import { emailStatusesBefore } from "./email-message-status";

describe("emailStatusesBefore", () => {
  it("lets nothing overwrite sent", () => {
    expect(emailStatusesBefore("sent")).toEqual([]);
  });

  it("moves a sent email on to delayed, never back from delivered", () => {
    expect(emailStatusesBefore("delayed")).toEqual(["sent"]);
    expect(emailStatusesBefore("delivered").sort()).toEqual(
      ["delayed", "sent"].sort()
    );
  });

  it("lets a complaint follow delivery", () => {
    expect(emailStatusesBefore("complained")).toContain("delivered");
  });

  it("keeps bounced, complained, failed and suppressed terminal", () => {
    for (const status of [
      "bounced",
      "complained",
      "failed",
      "suppressed",
    ] as const) {
      expect(emailStatusesBefore(status).sort()).toEqual(
        ["delayed", "delivered", "sent"].sort()
      );
    }
  });
});
