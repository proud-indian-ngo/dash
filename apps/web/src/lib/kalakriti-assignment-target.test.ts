import { describe, expect, it } from "bun:test";

import type { PickerUser } from "@/functions/users-for-picker";

import { kalakritiAssignmentMutationIds } from "./kalakriti-assignment-target";

const central: PickerUser = {
  email: "volunteer@example.com",
  id: "user-1",
  image: null,
  isActive: true,
  name: "Central Volunteer",
  role: "volunteer",
};

const local: PickerUser = {
  email: "",
  id: "membership-local",
  image: null,
  isActive: true,
  localMembership: true,
  name: "Walk In",
  role: "",
};

describe("kalakritiAssignmentMutationIds", () => {
  it("targets an existing local membership without a user", () => {
    expect(kalakritiAssignmentMutationIds(local.id, [local, central])).toEqual({
      membershipId: "membership-local",
    });
  });

  it("enrolls a central user with new membership and event member ids", () => {
    const result = kalakritiAssignmentMutationIds(central.id, [local, central]);
    expect(result.userId).toBe("user-1");
    expect(result.membershipId).not.toBe("user-1");
    expect(result.teamEventMemberId).toBeDefined();
  });
});
