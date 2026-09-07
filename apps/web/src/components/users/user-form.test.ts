import { describe, expect, it } from "vitest";

import { editUserFormSchema } from "./user-form";

describe("edit volunteer group", () => {
  const schema = editUserFormSchema.shape.registrationGroup;

  it("trims group names", () => {
    expect(schema.parse("  campus-west  ")).toBe("campus-west");
  });

  it("allows clearing the group", () => {
    expect(schema.parse("   ")).toBe("");
  });

  it("rejects group names longer than the signup limit", () => {
    expect(schema.safeParse("a".repeat(101)).success).toBe(false);
    expect(schema.safeParse("a".repeat(100)).success).toBe(true);
  });
});
