import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/db", () => ({ db: {} }));
vi.mock("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions: async () => [],
}));

import {
  type AuthorizedR2ObjectDeps,
  resolveAuthorizedR2Object,
} from "./authorized-r2-object";
import { R2ObjectAccessError } from "./r2-object-access";

const session = { user: { id: "owner", role: "volunteer" } };

const createDeps = (
  overrides: Partial<AuthorizedR2ObjectDeps> = {}
): AuthorizedR2ObjectDeps => ({
  findRecord: async () => null,
  isEventMember: async () => false,
  isTeamLead: async () => false,
  isTeamMember: async () => false,
  resolvePermissions: async () => [],
  ...overrides,
});

describe("resolveAuthorizedR2Object", () => {
  it("returns not found when no DB record matches the asset reference", async () => {
    await expect(
      resolveAuthorizedR2Object(
        session,
        { id: "missing", kind: "reimbursementAttachment" },
        createDeps()
      )
    ).rejects.toEqual(new R2ObjectAccessError(404, "Object not found"));
  });
});
