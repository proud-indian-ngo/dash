import { describe, expect, it, mock } from "bun:test";

import {
  ensureVolunteerHumanId,
  type VolunteerIdTx,
} from "./kalakriti-volunteer-id";

function setup(overrides: Record<string, unknown> = {}) {
  const membership = {
    editionId: "edition",
    id: "membership",
    humanId: null as string | null,
    kind: "volunteer",
    state: "active",
    ...overrides,
  };
  const edition = {
    id: "edition",
    lifecycle: "draft",
    year: 2027,
    nextVolunteerSequence: 12,
    eventDate: "2027-11-21",
  };
  const updateMembership = mock(async (patch: object) => {
    Object.assign(membership, patch);
  });
  const updateEdition = mock(async (patch: object) => {
    Object.assign(edition, patch);
  });
  const lock = mock(async () => [{ ...edition }]);
  const query = { from: () => query, where: () => query, for: lock };
  const run = mock(async () => membership);
  const tx = {
    location: "server",
    dbTransaction: { wrappedTransaction: { select: () => query } },
    run,
    mutate: {
      kalakritiEditionMembership: { update: updateMembership },
      kalakritiEdition: { update: updateEdition },
    },
  } as unknown as VolunteerIdTx;
  return {
    tx,
    membership,
    edition,
    lock,
    updateMembership,
    updateEdition,
    run,
  };
}

const args = { editionId: "edition", membershipId: "membership" };

describe("volunteer yearly ID allocation", () => {
  it("locks the Edition, allocates a yearly ID, and leaves replay unchanged", async () => {
    const { tx, lock, updateMembership, updateEdition } = setup();
    expect(await ensureVolunteerHumanId(tx, args)).toBe("KALV-2027-0012");
    expect(lock).toHaveBeenCalledWith("update");
    expect(updateMembership).toHaveBeenCalledWith({
      id: "membership",
      humanId: "KALV-2027-0012",
    });
    expect(updateEdition).toHaveBeenCalledWith({
      id: "edition",
      nextVolunteerSequence: 13,
    });
    expect(await ensureVolunteerHumanId(tx, args)).toBe("KALV-2027-0012");
    expect(updateMembership).toHaveBeenCalledTimes(1);
    expect(updateEdition).toHaveBeenCalledTimes(1);
  });

  it("preserves an existing yearly ID on reactivation", async () => {
    const { tx, updateMembership, updateEdition } = setup({
      humanId: "KALV-2027-0004",
    });
    expect(await ensureVolunteerHumanId(tx, args)).toBe("KALV-2027-0004");
    expect(updateMembership).not.toHaveBeenCalled();
    expect(updateEdition).not.toHaveBeenCalled();
  });

  it.each([
    { editionId: "other" },
    { kind: "guardian" },
    { state: "archived" },
  ])("rejects an invalid membership %j", async (overrides) => {
    const { tx, updateMembership, updateEdition } = setup(overrides);
    await expect(ensureVolunteerHumanId(tx, args)).rejects.toThrow();
    expect(updateMembership).not.toHaveBeenCalled();
    expect(updateEdition).not.toHaveBeenCalled();
  });

  it("rejects archived Editions before reading or changing membership", async () => {
    const { tx, edition, run, updateEdition } = setup();
    edition.lifecycle = "archived";
    await expect(ensureVolunteerHumanId(tx, args)).rejects.toThrow(
      "Edition is archived"
    );
    expect(run).not.toHaveBeenCalled();
    expect(updateEdition).not.toHaveBeenCalled();
  });
});
