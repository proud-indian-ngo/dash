import { describe, expect, it, vi } from "vitest";

import {
  buildSocialSettings,
  parseSocialRules,
  SOCIAL_MANAGE_CONFIG_KEYS,
  SOCIAL_RULES_CONFIG_KEY,
  SOCIAL_RULES_DEFAULTS,
  socialRulesSchema,
} from "./social-api";

const FULL_RULES = {
  impact: {
    buildTime: "08:15",
    held: false,
    line: "Thanks, everyone.",
    postDaysAfterBuild: 0,
    postTime: "10:45",
  },
  recap: {
    closingLine: "See you next week",
    held: false,
    lookbackDays: 14,
    photosMax: 4,
    postTime: "21:30",
    reelMinSeconds: 60,
    slideshowMinPhotos: 4,
  },
  schedule: {
    buildTime: "00:00",
    held: true,
    maxRows: 4,
    minRows: 4,
    postTime: "23:59",
    title: "Coming up",
  },
  story: { held: true },
  volunteerCall: { daysOut: 0, held: true, postTime: "18:05" },
};

const rulesConfig = (value: string) =>
  new Map([[SOCIAL_RULES_CONFIG_KEY, value]]);

describe("socialRulesSchema", () => {
  it("accepts every field at valid values, and an empty object", () => {
    expect(socialRulesSchema.parse(FULL_RULES)).toEqual(FULL_RULES);
    expect(socialRulesSchema.parse({})).toEqual({});
    expect(socialRulesSchema.parse({ schedule: {} })).toEqual({
      schedule: {},
    });
  });

  it("accepts the documented defaults", () => {
    expect(socialRulesSchema.safeParse(SOCIAL_RULES_DEFAULTS).success).toBe(
      true
    );
  });

  it("trims text fields", () => {
    expect(
      socialRulesSchema.parse({ schedule: { title: "  Coming up  " } })
    ).toEqual({ schedule: { title: "Coming up" } });
  });

  it.each([
    ["24-hour time out of range", { schedule: { postTime: "24:00" } }],
    ["minute out of range", { recap: { postTime: "20:60" } }],
    ["unpadded time", { impact: { buildTime: "9:00" } }],
    ["rows below 1", { schedule: { minRows: 0 } }],
    ["rows above 6", { schedule: { maxRows: 7 } }],
    ["fractional rows", { schedule: { minRows: 2.5 } }],
    ["min rows above max rows", { schedule: { maxRows: 3, minRows: 4 } }],
    ["min rows above default max", { schedule: { maxRows: 2 } }],
    ["lookback above 14", { recap: { lookbackDays: 15 } }],
    ["slideshow minimum above 12", { recap: { slideshowMinPhotos: 13 } }],
    ["photos max below slideshow minimum", { recap: { photosMax: 2 } }],
    ["reel below 5 s", { recap: { reelMinSeconds: 4 } }],
    ["days out above 14", { volunteerCall: { daysOut: 15 } }],
    ["post days above 6", { impact: { postDaysAfterBuild: 7 } }],
    ["held as a string", { story: { held: "true" } }],
    ["blank text", { recap: { closingLine: "   " } }],
    ["text over 120", { impact: { line: "x".repeat(121) } }],
    ["unknown field", { schedule: { colour: "red" } }],
    ["unknown kind", { reel: { held: true } }],
    ["number as a string", { volunteerCall: { daysOut: "4" } }],
  ])("rejects %s", (_name, value) => {
    expect(socialRulesSchema.safeParse(value).success).toBe(false);
  });
});

describe("parseSocialRules", () => {
  it("treats a missing or blank value as no rules", () => {
    expect(parseSocialRules(undefined)).toEqual({ error: null, rules: {} });
    expect(parseSocialRules("  ")).toEqual({ error: null, rules: {} });
  });

  it("reports bad JSON and out-of-contract values", () => {
    expect(parseSocialRules("{nope")).toEqual({
      error: "social_rules is not valid JSON",
      rules: {},
    });
    expect(parseSocialRules('{"recap":{"lookbackDays":99}}')).toEqual({
      error: expect.stringContaining("recap.lookbackDays"),
      rules: {},
    });
    expect(parseSocialRules("[]").error).not.toBeNull();
  });
});

describe("buildSocialSettings rules", () => {
  it("returns stored rules", () => {
    const onInvalid = vi.fn();
    const settings = buildSocialSettings(
      rulesConfig(JSON.stringify(FULL_RULES)),
      onInvalid
    );
    expect(settings.rules).toEqual(FULL_RULES);
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it("returns {} without a warning when unset", () => {
    const onInvalid = vi.fn();
    expect(buildSocialSettings(new Map(), onInvalid)).toEqual({
      paused: false,
      pausedKinds: [],
      rules: {},
    });
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it("returns {} and reports why when the stored value is invalid", () => {
    const onInvalid = vi.fn();
    const settings = buildSocialSettings(
      new Map([
        ["social_paused", "true"],
        [SOCIAL_RULES_CONFIG_KEY, '{"schedule":{"minRows":9}}'],
      ]),
      onInvalid
    );
    expect(settings).toEqual({ paused: true, pausedKinds: [], rules: {} });
    expect(onInvalid).toHaveBeenCalledWith(
      expect.stringContaining("schedule.minRows")
    );
  });
});

describe("SOCIAL_MANAGE_CONFIG_KEYS", () => {
  it("is exactly the seven social keys", () => {
    expect([...SOCIAL_MANAGE_CONFIG_KEYS].sort()).toEqual([
      "social_all_time_hours",
      "social_all_time_optimists",
      "social_all_time_reached",
      "social_approver_user_id",
      "social_paused",
      "social_paused_kinds",
      "social_rules",
    ]);
  });
});
