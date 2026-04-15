import { cityValues } from "@pi-dash/shared/constants";
import { describe, expect, it } from "vitest";
import z from "zod";

const userGenderValues = ["male", "female"] as const;

const createSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  dateOfBirth: z.number().nullable().optional(),
  gender: z.enum(userGenderValues).nullable().optional(),
  centerId: z.string().nullable().optional(),
  city: z.enum(cityValues).optional(),
  notes: z.string().optional(),
  now: z.number(),
});

const updateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  dateOfBirth: z.number().nullable().optional(),
  gender: z.enum(userGenderValues).nullable().optional(),
  centerId: z.string().nullable().optional(),
  city: z.enum(cityValues).optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
  now: z.number(),
});

const deactivateSchema = z.object({
  id: z.string(),
  now: z.number(),
});

describe("student mutator schemas", () => {
  describe("create", () => {
    it("accepts valid input with all fields", () => {
      const result = createSchema.safeParse({
        id: "student-1",
        name: "Test Student",
        dateOfBirth: 1_100_000_000_000,
        gender: "male",
        centerId: "center-1",
        city: "bangalore",
        notes: "Test notes",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts minimal valid input", () => {
      const result = createSchema.safeParse({
        id: "student-1",
        name: "Test Student",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = createSchema.safeParse({
        id: "student-1",
        name: "",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("accepts null dateOfBirth", () => {
      const result = createSchema.safeParse({
        id: "student-1",
        name: "Test Student",
        dateOfBirth: null,
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts null gender", () => {
      const result = createSchema.safeParse({
        id: "student-1",
        name: "Test Student",
        gender: null,
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid gender", () => {
      const result = createSchema.safeParse({
        id: "student-1",
        name: "Test Student",
        gender: "other",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("accepts null centerId", () => {
      const result = createSchema.safeParse({
        id: "student-1",
        name: "Test Student",
        centerId: null,
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("update", () => {
    it("accepts partial update", () => {
      const result = updateSchema.safeParse({
        id: "student-1",
        name: "Updated Name",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts isActive toggle", () => {
      const result = updateSchema.safeParse({
        id: "student-1",
        isActive: false,
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts null centerId for reassignment", () => {
      const result = updateSchema.safeParse({
        id: "student-1",
        centerId: null,
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("deactivate", () => {
    it("accepts valid input", () => {
      const result = deactivateSchema.safeParse({
        id: "student-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = deactivateSchema.safeParse({
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });
  });
});
