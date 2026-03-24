import { describe, expect, it } from "vitest";
import { groupSchema } from "./whatsapp-group-schema";

describe("groupSchema", () => {
  it("accepts valid input with all fields", () => {
    const result = groupSchema.safeParse({
      name: "General Chat",
      jid: "120363012345678901@g.us",
      description: "Main group",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input without description", () => {
    const result = groupSchema.safeParse({
      name: "General Chat",
      jid: "120363012345678901@g.us",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty description", () => {
    const result = groupSchema.safeParse({
      name: "General Chat",
      jid: "120363012345678901@g.us",
      description: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = groupSchema.safeParse({
      name: "",
      jid: "120363012345678901@g.us",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Name is required");
    }
  });

  it("rejects missing name", () => {
    const result = groupSchema.safeParse({
      jid: "120363012345678901@g.us",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty jid", () => {
    const result = groupSchema.safeParse({
      name: "General Chat",
      jid: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("JID is required");
    }
  });

  it("rejects missing jid", () => {
    const result = groupSchema.safeParse({
      name: "General Chat",
    });
    expect(result.success).toBe(false);
  });
});
