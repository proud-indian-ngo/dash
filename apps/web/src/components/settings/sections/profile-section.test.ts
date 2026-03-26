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
    dob: new Date(2000, 0, 15),
    gender: "male" as const,
    name: "John Doe",
    phone: "+911234567890",
  };

  it("accepts valid input", () => {
    const result = profileSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts undefined dob", () => {
    const result = profileSchema.safeParse({ ...valid, dob: undefined });
    expect(result.success).toBe(true);
  });

  it("accepts empty gender", () => {
    const result = profileSchema.safeParse({ ...valid, gender: "" });
    expect(result.success).toBe(true);
  });

  it("rejects name shorter than 2 characters", () => {
    const result = profileSchema.safeParse({ ...valid, name: "J" });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = profileSchema.safeParse({ ...valid, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects non-Date dob", () => {
    const result = profileSchema.safeParse({ ...valid, dob: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("accepts valid Date for dob", () => {
    const result = profileSchema.safeParse({
      ...valid,
      dob: new Date(1995, 11, 25),
    });
    expect(result.success).toBe(true);
  });
});
