import { rootRouteId, useLocation, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { loadPostHogAfterLoad } from "@/lib/load-posthog";

/** One `$pageview` per pathname, sent as the route template so record IDs never leave the browser. */
export function TelemetryPageviews() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const router = useRouter();

  useEffect(() => {
    const routeId = router.matchRoutes(pathname).at(-1)?.routeId;
    if (!routeId || routeId === rootRouteId) {
      return;
    }
    loadPostHogAfterLoad()
      .then(({ capturePageview, routeIdToTemplate }) =>
        capturePageview(routeIdToTemplate(routeId))
      )
      .catch(() => {
        // Non-critical
      });
  }, [pathname, router]);

  return null;
}
