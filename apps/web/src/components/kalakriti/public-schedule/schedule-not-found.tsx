import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Link } from "@tanstack/react-router";

import {
  NotFoundState,
  StandalonePage,
} from "@/components/shared/not-found-state";

export function ScheduleNotFound() {
  return (
    <StandalonePage>
      <NotFoundState
        actions={
          <Button nativeButton={false} render={<Link to="/" />}>
            Go to the dashboard
          </Button>
        }
        description="This Edition doesn't have a public schedule yet. Check the year in the address or try again later."
        icon={Calendar03Icon}
        title="Schedule not available"
      />
    </StandalonePage>
  );
}
