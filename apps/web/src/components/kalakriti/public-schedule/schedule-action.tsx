import { Button } from "@pi-dash/design-system/components/ui/button";
import { Link } from "@tanstack/react-router";

export function ScheduleAction({
  eventId,
  hasKalakritiAccess,
  isAuthenticated,
  year,
}: {
  eventId: string;
  hasKalakritiAccess: boolean;
  isAuthenticated: boolean;
  year: number;
}) {
  if (hasKalakritiAccess) {
    return (
      <Button
        nativeButton={false}
        render={<Link params={{ year: String(year) }} to="/kalakriti/$year" />}
      >
        Go to dashboard
      </Button>
    );
  }

  if (isAuthenticated) {
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
      <p className="max-w-xs text-muted-foreground text-sm md:text-right">
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
