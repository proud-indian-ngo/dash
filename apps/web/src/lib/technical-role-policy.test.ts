import { describe, expect, it } from "vitest";
import {
  assertGenericRoleAssignment,
  assertGenericUserManagement,
} from "./technical-role-policy";

describe("technical role policy", () => {
  it("rejects assigning the external user role", () => {
    expect(() => assertGenericRoleAssignment("external_user")).toThrow(
      "managed by its owning workflow"
    );
  });

  it("rejects generic management of an external user", () => {
    expect(() => assertGenericUserManagement("external_user")).toThrow(
      "managed by its owning workflow"
    );
  });

  it("allows central volunteer roles", () => {
    expect(() => assertGenericRoleAssignment("volunteer")).not.toThrow();
    expect(() => assertGenericUserManagement("volunteer")).not.toThrow();
  });
});
