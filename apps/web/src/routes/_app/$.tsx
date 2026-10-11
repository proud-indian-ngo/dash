import { Unlink01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import {
  createFileRoute,
  Link,
  notFound,
  useCanGoBack,
  useLocation,
} from "@tanstack/react-router";

import { NotFoundState } from "@/components/shared/not-found-state";

// Unknown addresses for signed-in people land here, inside the app layout,
// so the sidebar and breadcrumbs stay. Signed-out visitors are sent to log in
// by the _app guard first. Throwing notFound keeps the HTTP status a 404.
export const Route = createFileRoute("/_app/$")({
  loader: () => {
    throw notFound();
  },
  notFoundComponent: AppNotFound,
  head: () => ({ meta: [{ title: `Page not found | ${env.VITE_APP_NAME}` }] }),
});

function AppNotFound() {
  const { pathname } = useLocation();
  const canGoBack = useCanGoBack();
  const goBack = useEventCallback(() => window.history.back());

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <NotFoundState
        actions={
          <>
            <Button nativeButton={false} render={<Link to="/" />}>
              Go to dashboard
            </Button>
            {canGoBack ? (
              <Button onClick={goBack} type="button" variant="outline">
                Go back
              </Button>
            ) : null}
          </>
        }
        description={
          <>
            There's nothing at{" "}
            <code className="bg-muted text-foreground rounded px-1 py-0.5 font-mono text-xs break-all">
              {pathname}
            </code>
            . Check the address, or pick a page from the sidebar.
          </>
        }
        icon={Unlink01Icon}
        title="Page not found"
      />
    </div>
  );
}
