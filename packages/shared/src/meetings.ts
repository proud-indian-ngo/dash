/**
 * Board meetings: notice, quorum per agenda item, and
 * the result of a vote, by the deed in force on the meeting's date.
 * Pure, so the meeting page and the server agree.
 */

import {
  addDays,
  type DeedRules,
  quorumFor,
  RESOLUTION_THRESHOLD_LABELS,
  type TrusteeOffice,
} from "./governance";
import {
  effectSubject,
  neededFor,
  RESOLUTION_TEMPLATES,
  type ResolutionEffect,
  type ResolutionTemplateKey,
  thresholdFor,
} from "./resolutions";

export const meetingModeValues = ["in_person", "video", "hybrid"] as const;
export type MeetingMode = (typeof meetingModeValues)[number];

export const MEETING_MODE_LABELS: Record<MeetingMode, string> = {
  hybrid: "In person and video",
  in_person: "In person",
  video: "Video",
};

export const meetingStatusValues = [
  "draft",
  "convened",
  "held",
  "cancelled",
] as const;
export type MeetingStatus = (typeof meetingStatusValues)[number];

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  cancelled: "Cancelled",
  convened: "Notice sent",
  draft: "Draft",
  held: "Held",
};

export const presenceValues = [
  "in_person",
  "video",
  "absent_with_leave",
  "absent",
] as const;
export type Presence = (typeof presenceValues)[number];

export const PRESENCE_LABELS: Record<Presence, string> = {
  absent: "Absent",
  absent_with_leave: "Absent with leave",
  in_person: "Present",
  video: "On video",
};

export const agendaItemKindValues = [
  "resolution",
  "discussion",
  "note_circulars",
] as const;
export type AgendaItemKind = (typeof agendaItemKindValues)[number];

export const voteChoiceValues = ["for", "against", "abstain"] as const;
export type VoteChoice = (typeof voteChoiceValues)[number];

export const VOTE_CHOICE_LABELS: Record<VoteChoice, string> = {
  abstain: "Abstained",
  against: "Against",
  for: "For",
};

/** The earliest a meeting can start after its notice goes out. */
export function earliestStartAfterNotice(
  rules: DeedRules,
  noticeOn: string
): string {
  return addDays(noticeOn, rules.noticeDays);
}

/** Why a notice can't go out yet, or null. */
export function noticeProblem(
  rules: DeedRules,
  noticeOn: string,
  meetingOn: string
): string | null {
  const earliest = earliestStartAfterNotice(rules, noticeOn);
  if (meetingOn < earliest) {
    return `The deed needs at least ${rules.noticeDays} days' notice: a notice sent today allows a meeting on or after ${earliest}.`;
  }
  return null;
}

export interface AttendanceRow {
  offices: TrusteeOffice[];
  presence: Presence;
  trusteeId: string;
}

/** Whether a trustee counts as present: in person, or on video when the deed allows it. */
export function countsPresent(
  rules: Pick<DeedRules, "videoCountsPresent">,
  presence: Presence
): boolean {
  return (
    presence === "in_person" ||
    (presence === "video" && rules.videoCountsPresent)
  );
}

export interface QuorumState {
  /** Present trustees who aren't conflicted on this item. */
  counted: number;
  needed: number;
  quorate: boolean;
  /** Why it isn't quorate, when it isn't. */
  reason: string | null;
}

/**
 * Quorum for one agenda item (clauses 4.15 and 5.3): trustees present and
 * not conflicted, against the deed's figure, with the required office
 * holder among them.
 */
export function itemQuorum(input: {
  attendance: readonly AttendanceRow[];
  conflicted: readonly string[];
  /** Trustees in office on the meeting's date. */
  inOffice: number;
  rules: DeedRules;
}): QuorumState {
  const present = input.attendance.filter(
    (a) =>
      countsPresent(input.rules, a.presence) &&
      !input.conflicted.includes(a.trusteeId)
  );
  const needed = quorumFor(input.rules, input.inOffice);
  const required = input.rules.quorumRequiredOffice;
  if (present.length < needed) {
    return {
      counted: present.length,
      needed,
      quorate: false,
      reason: `${present.length} of the ${needed} trustees needed are present${input.rules.videoCountsPresent ? "" : " in person (video doesn't count under this deed)"}.`,
    };
  }
  if (required && !present.some((a) => a.offices.includes(required))) {
    return {
      counted: present.length,
      needed,
      quorate: false,
      reason: "The quorum needs the Managing Trustee present.",
    };
  }
  return { counted: present.length, needed, quorate: true, reason: null };
}

export interface VoteRow {
  absenteeWritten: boolean;
  choice: VoteChoice;
  conflict: boolean;
  trusteeId: string;
}

export interface ItemResult {
  against: number;
  /** "passed" or "failed" once decided; "no_decision" when inquorate. */
  outcome: "passed" | "failed" | "no_decision";
  for: number;
  quorum: QuorumState;
  reason: string | null;
  usedCastingVote: boolean;
}

/**
 * Why the chair can't give a casting vote on an item, or null: the deed
 * must give one, and the chair must be on the attendance list, counted
 * present and not conflicted on the item.
 */
export function castingVoteProblem(input: {
  attendance: readonly AttendanceRow[];
  chairTrusteeId: string | null;
  rules: Pick<DeedRules, "castingVote" | "videoCountsPresent">;
  votes: readonly VoteRow[];
}): string | null {
  if (input.rules.castingVote !== "chair") {
    return "The deed in force gives the chair no casting vote.";
  }
  const chair = input.attendance.find(
    (a) => a.trusteeId === input.chairTrusteeId
  );
  if (!chair) {
    return "Record who chairs the meeting, from the trustees the notice went to.";
  }
  if (!countsPresent(input.rules, chair.presence)) {
    return "The chair isn't counted present.";
  }
  if (input.votes.some((v) => v.trusteeId === chair.trusteeId && v.conflict)) {
    return "The chair declared an interest in this item.";
  }
  return null;
}

/**
 * Decides a resolution on the agenda by its template, on the votes that
 * count (clauses 4.15, 4.17 and 4.20). Quorum first. A simple majority
 * decides the majority templates, a tie going to an eligible chair's
 * casting vote; two-thirds and "all other trustees" are counted, as on a
 * circular, against the trustees on the attendance list who may vote: not
 * conflicted, and not the subject of a removal (clauses 7.12 and 9.3).
 */
export function itemResult(input: {
  attendance: readonly AttendanceRow[];
  castingVote: VoteChoice | null;
  chairTrusteeId: string | null;
  /** Trustees in office on the meeting's date. */
  inOffice: number;
  resolution: { effect: ResolutionEffect; templateKey: ResolutionTemplateKey };
  rules: DeedRules;
  /** Every vote recorded on the item. */
  votes: readonly VoteRow[];
}): ItemResult {
  const threshold = thresholdFor(
    RESOLUTION_TEMPLATES[input.resolution.templateKey],
    input.rules
  );
  const subject = votingSubject(threshold, input.resolution.effect);
  const conflicted = input.votes
    .filter((v) => v.conflict)
    .map((v) => v.trusteeId);
  const quorum = itemQuorum({
    attendance: input.attendance,
    conflicted,
    inOffice: input.inOffice,
    rules: input.rules,
  });
  const counted = countedVotes(input);
  const forVotes = counted.filter((v) => v.choice === "for").length;
  const against = counted.filter((v) => v.choice === "against").length;
  const decided = (
    outcome: ItemResult["outcome"],
    reason: string | null,
    usedCastingVote = false
  ): ItemResult => ({
    against,
    for: forVotes,
    outcome,
    quorum,
    reason,
    usedCastingVote,
  });
  if (!quorum.quorate) {
    return decided("no_decision", quorum.reason);
  }
  if (threshold !== "majority_in_office") {
    const eligible = input.attendance.filter(
      (a) => !conflicted.includes(a.trusteeId) && a.trusteeId !== subject
    ).length;
    const needed = neededFor(threshold, eligible);
    if (eligible === 0) {
      return decided("failed", "No trustee is left who can vote on it.");
    }
    if (forVotes >= needed) {
      return decided("passed", null);
    }
    return decided(
      "failed",
      `${forVotes} for; it needs ${needed} of the ${eligible} trustees who may vote (${RESOLUTION_THRESHOLD_LABELS[threshold].toLowerCase()}).`
    );
  }
  if (forVotes > against) {
    return decided("passed", null);
  }
  if (forVotes < against) {
    return decided("failed", "More votes against than for.");
  }
  if (input.castingVote === "for" || input.castingVote === "against") {
    const problem = castingVoteProblem({
      attendance: input.attendance,
      chairTrusteeId: input.chairTrusteeId,
      rules: input.rules,
      votes: input.votes,
    });
    if (!problem) {
      return decided(
        input.castingVote === "for" ? "passed" : "failed",
        `A tie, decided by the chair's casting vote ${input.castingVote}.`,
        true
      );
    }
    if (input.rules.castingVote === "chair") {
      return decided(
        "failed",
        `A tie. The casting vote doesn't count: ${problem}`
      );
    }
  }
  return decided(
    "failed",
    forVotes === 0 ? "No votes for." : "A tie with no casting vote."
  );
}

/**
 * What a decided item's result was worked out from, recorded with the
 * decision: attendance and the chair can change for later items, and this
 * item keeps the inputs it was decided on.
 */
export interface DecisionBasis {
  against: number;
  attendance: AttendanceRow[];
  chairTrusteeId: string | null;
  for: number;
  inOffice: number;
  quorum: { counted: number; needed: number };
  usedCastingVote: boolean;
}

/**
 * Trustees who attended a decided item differently from the meeting's
 * attendance list (they arrived or left), with how they attended the item.
 */
export function attendanceChanges(
  basis: Pick<DecisionBasis, "attendance">,
  attendance: readonly Pick<AttendanceRow, "presence" | "trusteeId">[]
): AttendanceRow[] {
  return basis.attendance.filter(
    (b) =>
      attendance.find((a) => a.trusteeId === b.trusteeId)?.presence !==
      b.presence
  );
}

/**
 * The votes that count toward an item's result: those of trustees counted
 * present, and the written views of trustees who were away (clause 4.20).
 * A trustee on video under a deed that doesn't count video, or marked
 * absent without written views, doesn't vote.
 */
export function countableVotes<V extends VoteRow>(
  rules: DeedRules,
  attendance: readonly AttendanceRow[],
  votes: readonly V[]
): V[] {
  return votes.filter((v) => {
    const row = attendance.find((a) => a.trusteeId === v.trusteeId);
    if (!row) {
      return false;
    }
    return countsPresent(rules, row.presence) || v.absenteeWritten;
  });
}

/** The trustee a removal is about, who leaves the count, or null. */
function votingSubject(
  threshold: ReturnType<typeof thresholdFor>,
  effect: ResolutionEffect
): string | null {
  return threshold === "unanimous_others" ? effectSubject(effect) : null;
}

/**
 * The votes an item's result counts, as `itemResult` tallies them: the
 * countable votes, less the conflicted and the subject of a removal. The
 * minutes list these, so they agree with the tally.
 */
export function countedVotes<V extends VoteRow>(input: {
  attendance: readonly AttendanceRow[];
  resolution: { effect: ResolutionEffect; templateKey: ResolutionTemplateKey };
  rules: DeedRules;
  votes: readonly V[];
}): V[] {
  const subject = votingSubject(
    thresholdFor(
      RESOLUTION_TEMPLATES[input.resolution.templateKey],
      input.rules
    ),
    input.resolution.effect
  );
  return countableVotes(input.rules, input.attendance, input.votes).filter(
    (v) => !v.conflict && v.trusteeId !== subject
  );
}

/**
 * Closing a meeting: why it can't close yet, or the resolutions it hands
 * back. Every resolution must have been put to the vote and a chair
 * recorded. One the meeting was inquorate for is withdrawn on its item,
 * which keeps its text in the minutes, and a copy becomes a circular draft.
 */
export function meetingClosing(input: {
  agenda: readonly {
    kind: AgendaItemKind;
    outcome: ItemResult["outcome"] | null;
    resolutionId: string | null;
  }[];
  chairTrusteeId: string | null;
}): { problem: string } | { released: string[] } {
  if (input.agenda.some((a) => a.kind === "resolution" && !a.outcome)) {
    return {
      problem: "Decide every resolution on the agenda first, or remove it.",
    };
  }
  if (!input.chairTrusteeId) {
    return { problem: "Record who chaired the meeting." };
  }
  return {
    released: input.agenda.flatMap((a) =>
      a.outcome === "no_decision" && a.resolutionId ? [a.resolutionId] : []
    ),
  };
}

/** Whether a resolution on the agenda has passed or failed. */
export function hasDecision(
  agenda: readonly { outcome: ItemResult["outcome"] | null }[]
): boolean {
  return agenda.some((a) => a.outcome === "passed" || a.outcome === "failed");
}

/**
 * Cancelling a meeting: refused once a resolution was decided at it (it is
 * closed instead), else the resolutions it hands back, as closing does.
 */
export function meetingCancelling(
  agenda: readonly {
    kind: AgendaItemKind;
    outcome: ItemResult["outcome"] | null;
    resolutionId: string | null;
  }[]
): { problem: string } | { released: string[] } {
  if (hasDecision(agenda)) {
    return {
      problem:
        "A resolution has been decided at this meeting. Mark it held instead.",
    };
  }
  return {
    released: agenda.flatMap((a) =>
      a.kind === "resolution" && a.resolutionId ? [a.resolutionId] : []
    ),
  };
}

/**
 * Clause 4.23: a trustee absent without leave from every meeting in the
 * last six months, or from three meetings in a row, whichever is later.
 * Returns the trustees to flag for a cessation resolution.
 */
export function absenceFlags(
  meetings: readonly {
    attendance: readonly { presence: Presence; trusteeId: string }[];
    heldOn: string;
  }[],
  today: string
): string[] {
  const held = [...meetings].sort((a, b) => b.heldOn.localeCompare(a.heldOn));
  const lastThree = held.slice(0, 3);
  const sixMonthsAgo = addDays(today, -183);
  const recent = held.filter((m) => m.heldOn >= sixMonthsAgo);
  const trustees = new Set(
    held.flatMap((m) => m.attendance.map((a) => a.trusteeId))
  );
  const flagged: string[] = [];
  for (const trusteeId of trustees) {
    const absentIn = (m: (typeof held)[number]) =>
      m.attendance.some(
        (a) => a.trusteeId === trusteeId && a.presence === "absent"
      );
    // "Whichever is later": both conditions must hold.
    const threeInARow = lastThree.length === 3 && lastThree.every(absentIn);
    const allSixMonths = recent.length > 0 && recent.every(absentIn);
    if (threeInARow && allSixMonths) {
      flagged.push(trusteeId);
    }
  }
  return flagged;
}

const IST_OFFSET_MS = 330 * 60 * 1000;

/** The instant a meeting starts, from its day and "HH:mm" in India time. */
export function kolkataInstant(isoDate: string, time: string): number {
  const [year = 0, month = 1, day = 1] = isoDate.split("-").map(Number);
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hours, minutes) - IST_OFFSET_MS;
}

/** The day and "HH:mm" an instant falls on in India time. */
export function kolkataParts(epoch: number): { date: string; time: string } {
  const shifted = new Date(epoch + IST_OFFSET_MS).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

export const MEETING_TITLE_MAX = 200;
export const MEETING_NOTES_MAX = 20_000;
