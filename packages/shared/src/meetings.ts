/**
 * Board meetings: notice, quorum per agenda item, and
 * the result of a vote, by the deed in force on the meeting's date.
 * Pure, so the meeting page and the server agree.
 */

import {
  addDays,
  type DeedRules,
  quorumFor,
  type TrusteeOffice,
} from "./governance";

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
export function countsPresent(rules: DeedRules, presence: Presence): boolean {
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
  reason: string | null;
  usedCastingVote: boolean;
}

/**
 * The result of a vote (clauses 4.17 and 4.20): a simple majority of the
 * votes cast, counting absent trustees' written votes; a tie goes to the
 * chair's casting vote when the deed gives one and the chair cast it.
 */
export function itemResult(input: {
  castingVote: VoteChoice | null;
  quorum: QuorumState;
  rules: DeedRules;
  votes: readonly VoteRow[];
}): ItemResult {
  const counted = input.votes.filter((v) => !v.conflict);
  const forVotes = counted.filter((v) => v.choice === "for").length;
  const against = counted.filter((v) => v.choice === "against").length;
  if (!input.quorum.quorate) {
    return {
      against,
      for: forVotes,
      outcome: "no_decision",
      reason: input.quorum.reason,
      usedCastingVote: false,
    };
  }
  if (forVotes > against) {
    return {
      against,
      for: forVotes,
      outcome: "passed",
      reason: null,
      usedCastingVote: false,
    };
  }
  if (forVotes < against) {
    return {
      against,
      for: forVotes,
      outcome: "failed",
      reason: "More votes against than for.",
      usedCastingVote: false,
    };
  }
  if (
    input.rules.castingVote === "chair" &&
    (input.castingVote === "for" || input.castingVote === "against")
  ) {
    return {
      against,
      for: forVotes,
      outcome: input.castingVote === "for" ? "passed" : "failed",
      reason: `A tie, decided by the chair's casting vote ${input.castingVote}.`,
      usedCastingVote: true,
    };
  }
  return {
    against,
    for: forVotes,
    outcome: "failed",
    reason: forVotes === 0 ? "No votes for." : "A tie with no casting vote.",
    usedCastingVote: false,
  };
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
