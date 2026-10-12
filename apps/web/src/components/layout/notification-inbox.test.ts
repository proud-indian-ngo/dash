import { describe, expect, it } from "bun:test";

import { stripLeadingEmoji } from "./notification-inbox";

describe("stripLeadingEmoji", () => {
  it("drops a leading emoji and its space", () => {
    expect(stripLeadingEmoji("👀 Photos need review")).toBe(
      "Photos need review"
    );
    expect(stripLeadingEmoji("↩️ Reimbursement not approved")).toBe(
      "Reimbursement not approved"
    );
    expect(stripLeadingEmoji("🗑️ R2 cleanup results")).toBe(
      "R2 cleanup results"
    );
  });

  it("keeps titles without one, and emoji later in the text", () => {
    expect(stripLeadingEmoji("Coming up!")).toBe("Coming up!");
    expect(stripLeadingEmoji("Great job 🎉")).toBe("Great job 🎉");
    expect(stripLeadingEmoji(null)).toBeNull();
  });
});
