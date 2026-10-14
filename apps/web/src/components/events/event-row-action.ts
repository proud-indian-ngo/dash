import type { EventInterest } from "@pi-dash/zero/schema";

type CardActionState =
  | { kind: "joined" }
  | { kind: "interestPending"; interestId: string; started: boolean }
  | { kind: "interestApproved" }
  | { kind: "interestDeclined" }
  | { kind: "interestNotReviewed" }
  | { kind: "join" }
  | { kind: "showInterest" }
  | { kind: "none" };

export function deriveCardActionState(opts: {
  isMember: boolean;
  interest: Pick<EventInterest, "id" | "status"> | undefined;
  hasStarted: boolean;
  canManageInterest: boolean;
  isOwnTeam: boolean;
  isPublic: boolean | null;
}): CardActionState {
  if (opts.isMember) {
    return { kind: "joined" };
  }
  if (opts.interest) {
    if (opts.interest.status === "pending") {
      return {
        interestId: opts.interest.id,
        kind: "interestPending",
        started: opts.hasStarted,
      };
    }
    if (opts.interest.status === "approved") {
      return { kind: "interestApproved" };
    }
    if (opts.interest.status === "rejected") {
      return { kind: "interestDeclined" };
    }
    // Closed by the daily job: the event started before anyone reviewed it.
    if (opts.interest.status === "expired") {
      return { kind: "interestNotReviewed" };
    }
  }
  if (opts.hasStarted || opts.canManageInterest) {
    return { kind: "none" };
  }
  if (opts.isOwnTeam) {
    return { kind: "join" };
  }
  if (opts.isPublic) {
    return { kind: "showInterest" };
  }
  return { kind: "none" };
}
