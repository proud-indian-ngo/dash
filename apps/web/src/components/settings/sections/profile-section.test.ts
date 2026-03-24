import { describe, expect, it } from "vitest";
import { genderSchema, profileSchema } from "./profile-schema";

describe("genderSchema", () => {
  it("accepts valid gender values", () => {
    expect(genderSchema.safeParse("male").success).toBe(true);
    expect(genderSchema.safeParse("female").success).toBe(true);
    expect(genderSchema.safeParse("unspecified").success).toBe(true);
  });

  it("accepts empty string", () => {
    expect(genderSchema.safeParse("").success).toBe(true);
  });

  it("rejects invalid gender", () => {
    expect(genderSchema.safeParse("other").success).toBe(false);
    expect(genderSchema.safeParse("unknown").success).toBe(false);
  });
});

describe("profileSchema", () => {
  const valid = {
    dob: "2000-01-15",
    gender: "male" as const,
    name: "John Doe",
    phone: "+911234567890",
  };

  it("accepts valid input", () => {
    const result = profileSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts empty dob", () => {
    const result = profileSchema.safeParse({ ...valid, dob: "" });
    expect(result.success).toBe(true);
  });

  it("accepts empty gender", () => {
    const result = profileSchema.safeParse({ ...valid, gender: "" });
    expect(result.success).toBe(true);
  });

  it("rejects name shorter than 2 characters", () => {
    const result = profileSchema.safeParse({ ...valid, name: "J" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Name must be at least 2 characters"
      );
    }
  });

  it("rejects empty name", () => {
    const result = profileSchema.safeParse({ ...valid, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid dob format", () => {
    const result = profileSchema.safeParse({ ...valid, dob: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("accepts valid ISO date for dob", () => {
    const result = profileSchema.safeParse({ ...valid, dob: "1995-12-25" });
    expect(result.success).toBe(true);
  });
});
