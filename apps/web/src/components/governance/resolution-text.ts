import type { ResolutionEffect } from "@pi-dash/shared/resolutions";

import { formatIso } from "./register-data";

/** A resolution's text split at blank lines. */
export function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** What the register records when the resolution passes, in a sentence. */
export function effectText(
  effect: ResolutionEffect,
  names: Map<string, string>
): string | null {
  const who =
    effect.type === "none" ? "" : (names.get(effect.trusteeId) ?? "A trustee");
  switch (effect.type) {
    case "none":
      return null;
    case "term_start":
      return `${who} becomes a trustee from ${formatIso(effect.startsOn)}${effect.endsOn ? ` to ${formatIso(effect.endsOn)}` : " for life"}.`;
    case "term_end":
      return `${who} ceases to be a trustee from ${formatIso(effect.endedOn)}, and their offices end.`;
    case "office_start":
      return `${who} holds the office from ${formatIso(effect.startsOn)}; the previous holder's office ends that day.`;
    case "removal":
      return `${who} is removed from ${formatIso(effect.endedOn)} (hearing on ${formatIso(effect.hearingOn)}).`;
    default:
      return null;
  }
}
