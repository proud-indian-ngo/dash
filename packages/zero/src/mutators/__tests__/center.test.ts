import { cityValues } from "@pi-dash/shared/constants";
import { describe, expect, it } from "vitest";
import z from "zod";

const createSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  city: z.enum(cityValues).optional(),
  address: z.string().optional(),
  now: z.number(),
});

const updateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  city: z.enum(cityValues).optional(),
  address: z.string().optional(),
  isActive: z.boolean().optional(),
  now: z.number(),
});

const assignCoordinatorSchema = z.object({
  id: z.string(),
  centerId: z.string(),
  userId: z.string(),
  now: z.number(),
});

describe("center mutator schemas", () => {
  describe("create", () => {
    it("accepts valid input with all fields", () => {
      const result = createSchema.safeParse({
        id: "center-1",
        name: "Test Center",
        city: "bangalore",
        address: "123 Main St",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts minimal valid input", () => {
      const result = createSchema.safeParse({
        id: "center-1",
        name: "Test Center",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = createSchema.safeParse({
        id: "center-1",
        name: "",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing id", () => {
      const result = createSchema.safeParse({
        name: "Test Center",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid city", () => {
      const result = createSchema.safeParse({
        id: "center-1",
        name: "Test Center",
        city: "invalid_city",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("update", () => {
    it("accepts partial update", () => {
      const result = updateSchema.safeParse({
        id: "center-1",
        name: "Updated Name",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts isActive toggle", () => {
      const result = updateSchema.safeParse({
        id: "center-1",
        isActive: false,
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("assignCoordinator", () => {
    it("accepts valid input", () => {
      const result = assignCoordinatorSchema.safeParse({
        id: "coord-1",
        centerId: "center-1",
        userId: "user-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing centerId", () => {
      const result = assignCoordinatorSchema.safeParse({
        id: "coord-1",
        userId: "user-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });
  });
});
