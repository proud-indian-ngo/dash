import type { PublicSessionSummary } from "@pi-dash/shared/public-events";
import { format } from "date-fns";

import { LONG_DATE_TIME } from "@/lib/date-formats";

/** Which session a public-website sign-up link is for, or that it closed. */
export function RegisterEventBanner({
  session,
}: {
  session: PublicSessionSummary;
}) {
  const when = format(new Date(session.startTime), LONG_DATE_TIME);
  return (
    <div
      className="border-primary/30 bg-primary/5 mb-6 border p-3 text-sm"
      data-testid="register-event-banner"
    >
      {session.open ? (
        <p>
          You're signing up to join <strong>{session.name}</strong>
          <span className="text-muted-foreground">
            {" "}
            · {when} · {session.area}
          </span>
          . Once you verify your email, we'll send the team your request.
        </p>
      ) : (
        <p>
          <strong>{session.name}</strong> ({when}) is no longer open for
          sign-ups. You can still create an account and find other sessions
          after you log in.
        </p>
      )}
    </div>
  );
}
