import { describe, expect, it } from "bun:test";

import {
  formToRules,
  ruleDefault,
  rulesToForm,
  serializeRules,
} from "./social-rules-form";

describe("posting rules form", () => {
  it("starts empty with held at the defaults", () => {
    const form = rulesToForm({});
    expect(Object.values(form.values).every((value) => value === "")).toBe(
      true
    );
    expect(form.held).toEqual({
      impact: true,
      recap: true,
      schedule: false,
      story: false,
      volunteerCall: false,
    });
    expect(formToRules(form)).toEqual({ errors: null, rules: {} });
  });

  it("round-trips stored rules and leaves default switches out", () => {
    const rules = {
      recap: { held: false, lookbackDays: 5 },
      schedule: { postTime: "18:30", title: "Coming up" },
      story: { held: true },
    };
    expect(formToRules(rulesToForm(rules))).toEqual({ errors: null, rules });
  });

  it("converts numbers, trims text and drops blank fields", () => {
    const form = rulesToForm({});
    form.values["schedule.maxRows"] = " 5 ";
    form.values["impact.line"] = "  Thanks all.  ";
    form.values["recap.postTime"] = "   ";
    expect(formToRules(form)).toEqual({
      errors: null,
      rules: { impact: { line: "Thanks all." }, schedule: { maxRows: 5 } },
    });
  });

  it("reports errors by kind.field", () => {
    const form = rulesToForm({});
    form.values["schedule.minRows"] = "5";
    form.values["schedule.maxRows"] = "4";
    form.values["volunteerCall.postTime"] = "7pm";
    form.values["recap.reelMinSeconds"] = "abc";
    const result = formToRules(form);
    expect(result.rules).toBeNull();
    expect(Object.keys(result.errors ?? {}).sort()).toEqual([
      "recap.reelMinSeconds",
      "schedule.maxRows",
      "volunteerCall.postTime",
    ]);
  });

  it("serializes no rules as a removal", () => {
    expect(serializeRules({})).toBe("");
    expect(serializeRules({ story: { held: true } })).toBe(
      '{"story":{"held":true}}'
    );
  });

  it("shows the pipeline default as the placeholder", () => {
    expect(ruleDefault("recap", "postTime")).toBe("20:00");
    expect(ruleDefault("schedule", "minRows")).toBe("3");
  });
});
