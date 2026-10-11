import { Unlink01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Link } from "@tanstack/react-router";

import {
  NotFoundState,
  StandalonePage,
} from "@/components/shared/not-found-state";

/**
 * Not-found outside the app layout. Signed-in unknown addresses use the
 * `_app/$` route instead, which keeps the sidebar.
 */
export function DefaultNotFound() {
  return (
    <StandalonePage>
      <NotFoundState
        actions={
          <Button nativeButton={false} render={<Link to="/" />}>
            Go to dashboard
          </Button>
        }
        description="This link doesn't lead anywhere. If someone sent it to you, log in and look for it from the dashboard."
        icon={Unlink01Icon}
        title="Page not found"
      />
    </StandalonePage>
  );
}
