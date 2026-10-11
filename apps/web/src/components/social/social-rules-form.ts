import {
  SOCIAL_RULES_DEFAULTS,
  type SocialRuleKind,
  type SocialRules,
  socialRulesSchema,
} from "@pi-dash/shared/social-api";

type RuleFieldType = "int" | "text" | "time";

interface RuleField {
  field: string;
  /** Help text after the default, for limits beyond the field's type. */
  hint?: string;
  label: string;
  type: RuleFieldType;
}

interface RuleCard {
  description: string;
  fields: readonly RuleField[];
  /** Extra help under the held switch. */
  heldHint?: string;
  heldLabel: string;
  kind: SocialRuleKind;
  title: string;
}

/** One card per post kind on Social page → Settings → Posting rules. */
export const RULE_CARDS: readonly RuleCard[] = [
  {
    description: "The weekly schedule of upcoming sessions.",
    fields: [
      { field: "buildTime", label: "Build time", type: "time" },
      {
        field: "postTime",
        hint: "After the build time, with an HH:00 in between: runs are hourly.",
        label: "Post time",
        type: "time",
      },
      { field: "minRows", label: "Minimum rows", type: "int" },
      { field: "maxRows", label: "Maximum rows", type: "int" },
      {
        field: "title",
        hint: "One line, up to 120 characters.",
        label: "Title",
        type: "text",
      },
    ],
    heldLabel: "Hold schedules for approval",
    kind: "schedule",
    title: "Weekly schedule",
  },
  {
    description: "The story that shares the weekly schedule.",
    fields: [],
    heldLabel: "Hold stories for approval",
    kind: "story",
    title: "Schedule story",
  },
  {
    description: "Posts after a session, from its recap and photos.",
    fields: [
      { field: "postTime", label: "Post time", type: "time" },
      { field: "lookbackDays", label: "Look back (days)", type: "int" },
      {
        field: "slideshowMinPhotos",
        label: "Photos for a slideshow",
        type: "int",
      },
      { field: "photosMax", label: "Most photos", type: "int" },
      { field: "reelMinSeconds", label: "Shortest reel (s)", type: "int" },
      {
        field: "closingLine",
        hint: "One line, up to 120 characters.",
        label: "Closing line",
        type: "text",
      },
    ],
    heldHint:
      "Recaps whose photo consent is not cleared stay held regardless of this setting.",
    heldLabel: "Hold recaps for approval",
    kind: "recap",
    title: "Recap",
  },
  {
    description: "Calls for volunteers before sessions that need more.",
    fields: [
      { field: "postTime", label: "Post time", type: "time" },
      {
        field: "daysOut",
        hint: "1 to 14 days.",
        label: "Days before the session",
        type: "int",
      },
    ],
    heldLabel: "Hold volunteer calls for approval",
    kind: "volunteerCall",
    title: "Volunteer call",
  },
  {
    description: "The monthly impact card on LinkedIn.",
    fields: [
      { field: "buildTime", label: "Build time", type: "time" },
      {
        field: "postTime",
        hint: "After the build time when posting on the build day.",
        label: "Post time",
        type: "time",
      },
      {
        field: "postDaysAfterBuild",
        label: "Post days after build",
        type: "int",
      },
      {
        field: "line",
        hint: "One line, up to 120 characters.",
        label: "Thank-you line",
        type: "text",
      },
    ],
    heldLabel: "Hold impact posts for approval",
    kind: "impact",
    title: "LinkedIn impact",
  },
];

/** Inputs as typed: text by `kind.field`, held switches by kind. */
export interface RulesFormState {
  held: Record<SocialRuleKind, boolean>;
  values: Record<string, string>;
}

const NUMBER_RE = /^-?\d+(\.\d+)?$/;

export const ruleFieldId = (kind: SocialRuleKind, field: string) =>
  `${kind}.${field}`;

/** Pipeline default shown as the field's placeholder. */
export function ruleDefault(kind: SocialRuleKind, field: string): string {
  const defaults: Record<string, unknown> = SOCIAL_RULES_DEFAULTS[kind];
  return String(defaults[field] ?? "");
}

/** Stored rules → form; unset fields are empty, held shows the effective value. */
export function rulesToForm(rules: SocialRules): RulesFormState {
  const values: Record<string, string> = {};
  const held = {} as Record<SocialRuleKind, boolean>;
  for (const { fields, kind } of RULE_CARDS) {
    const stored: Record<string, unknown> = rules[kind] ?? {};
    for (const { field } of fields) {
      const value = stored[field];
      values[ruleFieldId(kind, field)] =
        value === undefined ? "" : String(value);
    }
    held[kind] =
      typeof stored.held === "boolean"
        ? stored.held
        : SOCIAL_RULES_DEFAULTS[kind].held;
  }
  return { held, values };
}

export type RulesFormResult =
  | { errors: null; rules: SocialRules }
  | { errors: Record<string, string>; rules: null };

/**
 * Form → rules to store: empty fields and held switches at their default are
 * left out (the pipeline uses its own), then the shared schema validates.
 * Errors are keyed by `kind.field`.
 */
export function formToRules(form: RulesFormState): RulesFormResult {
  const draft: Record<string, Record<string, unknown>> = {};
  for (const { fields, kind } of RULE_CARDS) {
    const entry: Record<string, unknown> = {};
    for (const { field, type } of fields) {
      const raw = (form.values[ruleFieldId(kind, field)] ?? "").trim();
      if (raw === "") {
        continue;
      }
      entry[field] = type === "int" && NUMBER_RE.test(raw) ? Number(raw) : raw;
    }
    if (form.held[kind] !== SOCIAL_RULES_DEFAULTS[kind].held) {
      entry.held = form.held[kind];
    }
    if (Object.keys(entry).length > 0) {
      draft[kind] = entry;
    }
  }
  const parsed = socialRulesSchema.safeParse(draft);
  if (parsed.success) {
    return { errors: null, rules: parsed.data };
  }
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".");
    errors[key] ??= issue.message;
  }
  return { errors, rules: null };
}

/** The app_config value to write; empty means remove the key. */
export function serializeRules(rules: SocialRules): string {
  return Object.keys(rules).length > 0 ? JSON.stringify(rules) : "";
}
