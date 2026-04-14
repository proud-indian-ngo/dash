export const REMINDER_PRESETS = [
  { label: "1 week", minutes: 10_080 },
  { label: "3 days", minutes: 4320 },
  { label: "1 day", minutes: 1440 },
  { label: "2 hours", minutes: 120 },
  { label: "30 min", minutes: 30 },
] as const;

export type ReminderPreset = (typeof REMINDER_PRESETS)[number];

/** Default RSVP poll lead time in minutes (3 days). */
export const DEFAULT_RSVP_POLL_LEAD_MINUTES = 4320;

export const RSVP_POLL_LEAD_PRESETS = [
  { label: "1 week", minutes: 10_080 },
  { label: "5 days", minutes: 7200 },
  { label: "3 days", minutes: 4320 },
  { label: "2 days", minutes: 2880 },
  { label: "1 day", minutes: 1440 },
] as const;

export type RsvpPollLeadPreset = (typeof RSVP_POLL_LEAD_PRESETS)[number];

export const RSVP_POLL_LEAD_PRESET_MINUTES: readonly number[] =
  RSVP_POLL_LEAD_PRESETS.map((p) => p.minutes);

export const REMINDER_PRESET_MINUTES: readonly number[] = REMINDER_PRESETS.map(
  (p) => p.minutes
);

/** Negative sentinels used in `event_reminder_sent.intervalMinutes` for post-event nudges. */
export const POST_EVENT_SENTINELS = {
  feedbackNudge: -360,
  attendanceReminder: -1440,
  photoNudge: -1441,
} as const;

/** Convert minutes to a human-readable label like "in 1 day" or "in 2 hours". */
export function formatReminderInterval(minutes: number): string {
  if (minutes >= 10_080) {
    const weeks = Math.round(minutes / 10_080);
    return `${weeks} week${weeks > 1 ? "s" : ""}`;
  }
  if (minutes >= 1440) {
    const days = Math.round(minutes / 1440);
    return `${days} day${days > 1 ? "s" : ""}`;
  }
  if (minutes >= 60) {
    const hours = Math.round(minutes / 60);
    return `${hours} hour${hours > 1 ? "s" : ""}`;
  }
  return `${minutes} min`;
}
