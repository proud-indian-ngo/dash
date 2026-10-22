import { describe, expect, it } from "bun:test";

import {
  formToRules,
  groupRuleIssues,
  rulesToForm,
  sameRulesForm,
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
    expect(result.errors?.form).toEqual([]);
    expect(Object.keys(result.errors?.fields ?? {}).sort()).toEqual([
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

  it("shows the schedule window error on the post time", () => {
    const form = rulesToForm({});
    form.values["schedule.buildTime"] = "18:30";
    expect(formToRules(form).errors?.fields).toEqual({
      "schedule.postTime":
        "Leave a full hour (HH:00) from the build time until before the post time; the pipeline runs on the hour",
    });
  });

  it("reports only the field's own error when a time is malformed", () => {
    const form = rulesToForm({});
    form.values["schedule.buildTime"] = "abc";
    expect(formToRules(form).errors).toEqual({
      fields: { "schedule.buildTime": "Use HH:MM (24-hour)" },
      form: [],
    });
  });

  it("keeps issues no field shows as form-level lines", () => {
    expect(
      groupRuleIssues([
        { message: 'Unrecognized key: "colour"', path: ["schedule"] },
        { message: "Invalid input", path: [] },
        { message: "Use true or false", path: ["recap", "held"] },
        { message: "Use HH:MM (24-hour)", path: ["recap", "postTime"] },
      ])
    ).toEqual({
      fields: { "recap.postTime": "Use HH:MM (24-hour)" },
      form: [
        'schedule: Unrecognized key: "colour"',
        "Invalid input",
        "recap.held: Use true or false",
      ],
    });
  });

  it("compares form states by their inputs", () => {
    const a = rulesToForm({ recap: { lookbackDays: 5 } });
    expect(sameRulesForm(a, rulesToForm({ recap: { lookbackDays: 5 } }))).toBe(
      true
    );
    expect(sameRulesForm(a, rulesToForm({}))).toBe(false);
    expect(
      sameRulesForm(rulesToForm({}), rulesToForm({ story: { held: true } }))
    ).toBe(false);
  });
});
