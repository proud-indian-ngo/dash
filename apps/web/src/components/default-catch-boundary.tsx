import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type ErrorComponentProps,
  Link,
  rootRouteId,
  useCanGoBack,
  useMatch,
  useRouter,
} from "@tanstack/react-router";
import { log } from "evlog";
import { useEffect, useRef } from "react";

import { ErrorState } from "@/components/shared/error-state";
import { StandalonePage } from "@/components/shared/not-found-state";
import {
  isChunkLoadError,
  reloadClearingCache,
  reloadForChunkError,
} from "@/lib/chunk-load-error";
import { getErrorReference } from "@/lib/error-reference";

const loadPosthog = () => import("@/lib/posthog");

export function DefaultCatchBoundary({ error }: Readonly<ErrorComponentProps>) {
  const router = useRouter();
  const isRoot = useMatch({
    select: (state) => state.id === rootRouteId,
    strict: false,
  });
  const canGoBack = useCanGoBack();
  const chunkLoadFailed = isChunkLoadError(error);
  const loggedErrorRef = useRef<unknown>(null);

  useEffect(() => {
    if (loggedErrorRef.current === error) {
      return;
    }
    loggedErrorRef.current = error;
    // A chunk from another deploy failed to load: only a full reload recovers.
    if (chunkLoadFailed && reloadForChunkError(error)) {
      return;
    }
    const traceId = getErrorReference(error);
    log.error({
      component: "DefaultCatchBoundary",
      message: error instanceof Error ? error.message : String(error),
      route: typeof window === "undefined" ? "" : window.location.pathname,
      traceId,
    });
    if (error instanceof Error) {
      loadPosthog()
        .then(({ captureException }) => captureException(error, { traceId }))
        .catch(() => {
          // Non-critical
        });
    }
  }, [chunkLoadFailed, error]);

  const retry = useEventCallback(async () => {
    if (chunkLoadFailed) {
      await reloadClearingCache();
      return;
    }
    await router.invalidate();
  });
  const goBack = useEventCallback(() => window.history.back());

  const content = (
    <ErrorState
      actions={
        <>
          <Button onClick={retry} type="button">
            {chunkLoadFailed ? "Reload" : "Try again"}
          </Button>
          {!isRoot && canGoBack ? (
            <Button onClick={goBack} type="button" variant="outline">
              Go back
            </Button>
          ) : (
            <Button
              nativeButton={false}
              render={<Link to="/" />}
              variant="outline"
            >
              Go to dashboard
            </Button>
          )}
        </>
      }
      error={error}
    />
  );

  // A root-level failure has no app layout around it, so frame it with the logo.
  return isRoot ? (
    <StandalonePage>{content}</StandalonePage>
  ) : (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      {content}
    </div>
  );
}
