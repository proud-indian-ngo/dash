import { Button } from "@pi-dash/design-system/components/ui/button";
import { Link } from "@tanstack/react-router";

type ScheduleActionKind = "dashboard" | "showInterest" | "signUp" | "none";

/**
 * What the schedule offers its viewer. Interest closes when the linked event
 * is cancelled or starts, so a viewer without Kalakriti access is offered
 * nothing then.
 */
export function scheduleActionKind({
  hasKalakritiAccess,
  interestClosed,
  isAuthenticated,
}: {
  hasKalakritiAccess: boolean;
  interestClosed: boolean;
  isAuthenticated: boolean;
}): ScheduleActionKind {
  if (hasKalakritiAccess) {
    return "dashboard";
  }
  if (interestClosed) {
    return "none";
  }
  return isAuthenticated ? "showInterest" : "signUp";
}

export function ScheduleAction({
  eventId,
  kind,
  year,
}: {
  eventId: string;
  kind: Exclude<ScheduleActionKind, "none">;
  year: number;
}) {
  if (kind === "dashboard") {
    return (
      <Button
        nativeButton={false}
        render={<Link params={{ year: String(year) }} to="/kalakriti/$year" />}
      >
        Go to dashboard
      </Button>
    );
  }

  if (kind === "showInterest") {
    return (
      <Button
        nativeButton={false}
        render={<Link params={{ id: eventId }} to="/events/$id" />}
      >
        Show interest
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <p className="text-muted-foreground max-w-xs text-sm md:text-right">
        Want to help at Kalakriti? Create an account to show your interest.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button nativeButton={false} render={<Link to="/register" />}>
          Sign up
        </Button>
        <Button
          nativeButton={false}
          render={<Link to="/login" />}
          variant="outline"
        >
          Log in
        </Button>
      </div>
    </div>
  );
}
