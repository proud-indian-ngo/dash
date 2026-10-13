import { describe, expect, it } from "bun:test";

import { GIVE_INDIA_PARTY_ID } from "@pi-dash/shared/constants";

import { contributorOptions, type PartyRow } from "./party-row";

function party(
  id: string,
  roles: { active: boolean; role: string }[]
): PartyRow {
  return {
    displayName: id,
    id,
    roles: roles.map((r, i) => ({ ...r, id: `${id}-${i}`, partyId: id })),
  } as unknown as PartyRow;
}

describe("contributorOptions", () => {
  it("offers donors, sponsors, grantors and intermediaries with their roles", () => {
    expect(
      contributorOptions([
        party("Asha", [{ active: true, role: "donor" }]),
        party("Infosys", [{ active: true, role: "sponsor" }]),
        party("Goodera", [
          { active: true, role: "intermediary" },
          { active: true, role: "vendor" },
        ]),
        party("Trust", [{ active: true, role: "grantor" }]),
      ])
    ).toEqual([
      { label: "Asha (Donor)", value: "Asha" },
      { label: "Infosys (Sponsor)", value: "Infosys" },
      { label: "Goodera (Intermediary)", value: "Goodera" },
      { label: "Trust (Grantor)", value: "Trust" },
    ]);
  });

  it("leaves out lapsed givers and parties with other roles only", () => {
    expect(
      contributorOptions([
        party("Lapsed", [{ active: false, role: "donor" }]),
        party("Vendor", [{ active: true, role: "vendor" }]),
      ])
    ).toEqual([]);
  });

  it("never offers GiveIndia as a giver unless it holds a giver role", () => {
    const giveIndia = (roles: { active: boolean; role: string }[]) => ({
      ...party("GiveIndia (give.do)", roles),
      id: GIVE_INDIA_PARTY_ID,
    });
    expect(
      contributorOptions([giveIndia([{ active: true, role: "intermediary" }])])
    ).toEqual([]);
    expect(
      contributorOptions([
        giveIndia([
          { active: true, role: "intermediary" },
          { active: true, role: "donor" },
        ]),
      ])
    ).toEqual([
      {
        label: "GiveIndia (give.do) (Intermediary, Donor)",
        value: GIVE_INDIA_PARTY_ID,
      },
    ]);
  });
});
