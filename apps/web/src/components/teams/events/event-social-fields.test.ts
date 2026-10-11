import { describe, expect, it } from "bun:test";

import {
  buildSocialFields,
  deriveSocialRecapMode,
} from "./event-social-fields";

const inherited = {
  partners: [{ instagram: "@ethos", linkedin: "ethos", name: "Ethos" }],
  volunteersNeeded: 6,
};

const formValue = (
  partners: { instagram: string; linkedin: string; name: string }[],
  volunteersNeeded: string
) => ({
  partners: partners.map((partner, index) => ({
    ...partner,
    key: `k-${index}`,
  })),
  volunteersNeeded,
});

const unchanged = formValue(
  [{ instagram: "ethos", linkedin: " ethos ", name: " Ethos " }],
  "6"
);

describe("buildSocialFields", () => {
  it("always sends both fields for all, following and plain edits", () => {
    const fields = buildSocialFields(unchanged, { initial: inherited });
    expect(fields.volunteersNeeded).toBe(6);
    expect(fields.partners?.map((p) => p.name)).toEqual(["Ethos"]);
  });

  it("omits unchanged inherited values for a single occurrence", () => {
    expect(
      buildSocialFields(unchanged, { initial: inherited, omitUnchanged: true })
    ).toEqual({});
  });

  it("sends only the field the user changed", () => {
    const changedTarget = buildSocialFields(
      formValue(
        [{ instagram: "@ethos", linkedin: "ethos", name: "Ethos" }],
        "8"
      ),
      { initial: inherited, omitUnchanged: true }
    );
    expect(changedTarget).toEqual({ volunteersNeeded: 8 });

    const changedPartners = buildSocialFields(
      formValue([{ instagram: "", linkedin: "", name: "NSS" }], "6"),
      { initial: inherited, omitUnchanged: true }
    );
    expect(Object.keys(changedPartners)).toEqual(["partners"]);
    expect(changedPartners.partners?.[0]).toMatchObject({
      instagram: null,
      linkedin: null,
      name: "NSS",
    });
  });

  it("sends a cleared target and cleared partners", () => {
    expect(
      buildSocialFields(formValue([], ""), {
        initial: inherited,
        omitUnchanged: true,
      })
    ).toEqual({ partners: [], volunteersNeeded: null });
  });
});

describe("deriveSocialRecapMode", () => {
  const series = {
    cancelledAt: null,
    recurrenceRule: { rrule: "FREQ=WEEKLY" },
    seriesId: null,
  };
  const base = {
    canManageAttendance: true,
    canMaterialize: true,
    event: series,
    existingOccurrenceId: undefined,
    isPastEvent: true,
    isVirtualOccurrence: true,
  };

  it("offers Start recap on a past virtual occurrence to users who can materialise", () => {
    expect(deriveSocialRecapMode(base)).toBe("materialize");
  });

  it("hides Start recap from attendance managers who cannot materialise", () => {
    expect(deriveSocialRecapMode({ ...base, canMaterialize: false })).toBe(
      null
    );
  });

  it("still offers it when the occurrence row already exists, to open it", () => {
    expect(
      deriveSocialRecapMode({
        ...base,
        canMaterialize: false,
        existingOccurrenceId: "exc-1",
      })
    ).toBe("materialize");
  });

  it("shows the form on a single session and nothing on a series parent", () => {
    expect(
      deriveSocialRecapMode({
        ...base,
        event: { ...series, recurrenceRule: null, seriesId: "s" },
        isVirtualOccurrence: false,
      })
    ).toBe("form");
    expect(deriveSocialRecapMode({ ...base, isVirtualOccurrence: false })).toBe(
      null
    );
  });
});
