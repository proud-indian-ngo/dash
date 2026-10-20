/**
 * The compliance calendar: what is due when. Pure, so
 * the generating job, the page and the tests agree. Dates are `yyyy-MM-dd`.
 */

import { addDays } from "./governance";

export const complianceRuleKindValues = [
  "yearly",
  "registration",
  "term_end",
] as const;
export type ComplianceRuleKind = (typeof complianceRuleKindValues)[number];

export const complianceItemStatusValues = ["open", "done", "waived"] as const;
export type ComplianceItemStatus = (typeof complianceItemStatusValues)[number];

export const COMPLIANCE_STATUS_LABELS: Record<ComplianceItemStatus, string> = {
  done: "Done",
  open: "Open",
  waived: "Not needed",
};

/** A day in the year, in the trust's April-to-March financial year. */
export interface YearDay {
  /** Shown after the template's title when a template has several dates, e.g. "Q1". */
  label?: string;
  day: number;
  month: number;
}

export interface ComplianceTemplateRule {
  /** For "yearly": the days it falls due in each financial year. */
  dates: YearDay[] | null;
  kind: ComplianceRuleKind;
  /** For "registration" and "term_end": days from the expiry or the term's last day (negative is before). */
  offsetDays: number | null;
  /** For "registration": which registration's validity it follows. */
  registrationType: string | null;
}

export interface ComplianceTemplateDefinition extends ComplianceTemplateRule {
  description: string;
  key: string;
  title: string;
}

/** Reminder offsets before an item's due date. */
export const COMPLIANCE_REMINDER_DAYS = [30, 7, 1] as const;

/** How far ahead items are created, so owners see them coming. */
export const COMPLIANCE_HORIZON_DAYS = 400;

/** The calendar every deployment starts with; edited in the app afterwards. */
export const DEFAULT_COMPLIANCE_TEMPLATES: ComplianceTemplateDefinition[] = [
  {
    dates: [{ day: 30, month: 9 }],
    description:
      "File the audit report of the trust's accounts, signed by the auditor (formerly Form 10B).",
    key: "form_112",
    kind: "yearly",
    offsetDays: null,
    registrationType: null,
    title: "Audit report (Form 112)",
  },
  {
    dates: [{ day: 31, month: 10 }],
    description: "File the trust's income-tax return.",
    key: "itr_7",
    kind: "yearly",
    offsetDays: null,
    registrationType: null,
    title: "Income-tax return (ITR-7)",
  },
  {
    dates: [{ day: 31, month: 5 }],
    description:
      "File the statement of donations (Form 113) and issue the donors' certificates (Form 114) for the year that ended.",
    key: "donations_return",
    kind: "yearly",
    offsetDays: null,
    registrationType: null,
    title: "Donations return (Forms 113 and 114)",
  },
  {
    dates: [
      { day: 31, label: "Q1", month: 7 },
      { day: 31, label: "Q2", month: 10 },
      { day: 31, label: "Q3", month: 1 },
      { day: 31, label: "Q4", month: 5 },
    ],
    description: "File the quarterly TDS return for tax deducted on payments.",
    key: "tds_return",
    kind: "yearly",
    offsetDays: null,
    registrationType: null,
    title: "TDS return",
  },
  {
    dates: [{ day: 31, month: 3 }],
    description:
      "The Board approves the next financial year's budget before it starts (clause 7.7).",
    key: "budget",
    kind: "yearly",
    offsetDays: null,
    registrationType: null,
    title: "Next year's budget approved",
  },
  {
    dates: [{ day: 15, month: 9 }],
    description:
      "The Board approves the audited accounts of the year that ended, in time for the audit report.",
    key: "accounts_approval",
    kind: "yearly",
    offsetDays: null,
    registrationType: null,
    title: "Annual accounts approved by the Board",
  },
  {
    dates: [{ day: 30, month: 4 }],
    description:
      "Every trustee in office declares their interests for the new financial year, or that they have none (clause 5.3), on the Declarations page.",
    key: "interest_declarations",
    kind: "yearly",
    offsetDays: null,
    registrationType: null,
    title: "Trustees' declarations of interests",
  },
  {
    dates: [{ day: 30, month: 6 }],
    description:
      "The Board appoints or reappoints the auditor for the year, before the audit starts.",
    key: "auditor_appointment",
    kind: "yearly",
    offsetDays: null,
    registrationType: null,
    title: "Auditor appointed for the year",
  },
  {
    dates: [{ day: 31, month: 8 }],
    description:
      "When income is set apart for a purpose: the Board's resolution and the accumulation statement (Form 109), at least two months before the income-tax return is due. Mark it not needed in a year with no accumulation.",
    key: "accumulation",
    kind: "yearly",
    offsetDays: null,
    registrationType: null,
    title: "Accumulation of income (Form 109)",
  },
  {
    dates: [{ day: 30, month: 6 }],
    description:
      "Send the principal donors the yearly report of the work their money did.",
    key: "donor_report",
    kind: "yearly",
    offsetDays: null,
    registrationType: null,
    title: "Yearly report to principal donors",
  },
  {
    dates: null,
    description:
      "Apply to renew the 80G approval at least six months before it expires.",
    key: "renew_80g",
    kind: "registration",
    offsetDays: -183,
    registrationType: "80g",
    title: "Renew 80G approval",
  },
  {
    dates: null,
    description:
      "Apply to renew the 12AB registration at least six months before it expires.",
    key: "renew_12ab",
    kind: "registration",
    offsetDays: -183,
    registrationType: "12ab",
    title: "Renew 12AB registration",
  },
  {
    dates: null,
    description:
      "A trustee's fixed term ends: reappoint them or appoint someone in their place by resolution.",
    key: "term_end",
    kind: "term_end",
    offsetDays: -90,
    registrationType: null,
    title: "Trustee term ends",
  },
];

/** The April-to-March year a date falls in: "2026-27". */
export function fiscalYearLabel(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The date a year-day falls on in a financial year starting in April of `startYear`. */
export function dateInFiscalYear(startYear: number, day: YearDay): string {
  const year = day.month >= 4 ? startYear : startYear + 1;
  const lastDay = new Date(Date.UTC(year, day.month, 0)).getUTCDate();
  const d = Math.min(day.day, lastDay);
  return `${year}-${String(day.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface ComplianceOccurrence {
  dueOn: string;
  fiscalYear: string;
  /** Stable per occurrence, so generating twice creates nothing new. */
  sourceKey: string;
  title: string;
}

export interface OccurrenceInputs {
  registrations: { id: string; type: string; validTo: string | null }[];
  terms: {
    endedOn: string | null;
    endsOn: string | null;
    id: string;
    trusteeName: string;
  }[];
}

/**
 * Every occurrence of a template due between `from` and `to` (inclusive):
 * the yearly dates in each financial year the window touches, a renewal
 * before each registration's expiry, a reminder before each fixed term
 * ends.
 */
export function occurrencesBetween(
  template: ComplianceTemplateDefinition,
  inputs: OccurrenceInputs,
  from: string,
  to: string
): ComplianceOccurrence[] {
  const found: ComplianceOccurrence[] = [];
  const within = (date: string) => date >= from && date <= to;
  if (template.kind === "yearly" && template.dates) {
    const firstYear = Number(fiscalYearLabel(from).slice(0, 4));
    const lastYear = Number(fiscalYearLabel(to).slice(0, 4));
    for (let year = firstYear; year <= lastYear; year++) {
      for (const day of template.dates) {
        const dueOn = dateInFiscalYear(year, day);
        if (within(dueOn)) {
          const fiscalYear = fiscalYearLabel(dueOn);
          found.push({
            dueOn,
            fiscalYear,
            sourceKey: `${template.key}:${year}:${day.label ?? `${day.month}-${day.day}`}`,
            title: day.label
              ? `${template.title} (${day.label})`
              : template.title,
          });
        }
      }
    }
  }
  if (template.kind === "registration") {
    for (const registration of inputs.registrations) {
      if (
        registration.type !== template.registrationType ||
        !registration.validTo
      ) {
        continue;
      }
      const dueOn = addDays(registration.validTo, template.offsetDays ?? 0);
      if (within(dueOn)) {
        found.push({
          dueOn,
          fiscalYear: fiscalYearLabel(dueOn),
          sourceKey: `${template.key}:${registration.id}:${registration.validTo}`,
          title: template.title,
        });
      }
    }
  }
  if (template.kind === "term_end") {
    for (const term of inputs.terms) {
      if (!term.endsOn || term.endedOn) {
        continue;
      }
      const dueOn = addDays(term.endsOn, template.offsetDays ?? 0);
      if (within(dueOn)) {
        found.push({
          dueOn,
          fiscalYear: fiscalYearLabel(dueOn),
          sourceKey: `${template.key}:${term.id}:${term.endsOn}`,
          title: `${template.title}: ${term.trusteeName}`,
        });
      }
    }
  }
  return found.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

/** Open items whose due date is exactly a reminder offset away. */
export function itemsDueForReminder<
  T extends { dueOn: string; status: string },
>(items: readonly T[], today: string): { daysLeft: number; item: T }[] {
  const due: { daysLeft: number; item: T }[] = [];
  for (const item of items) {
    if (item.status !== "open") {
      continue;
    }
    for (const days of COMPLIANCE_REMINDER_DAYS) {
      if (addDays(today, days) === item.dueOn) {
        due.push({ daysLeft: days, item });
      }
    }
  }
  return due;
}

export const COMPLIANCE_TITLE_MAX = 200;
export const COMPLIANCE_NOTE_MAX = 1000;
