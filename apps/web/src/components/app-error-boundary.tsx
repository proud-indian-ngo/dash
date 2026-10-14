import { Alert01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { log } from "evlog";
import { type ReactNode, use } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";

import { ErrorState } from "@/components/shared/error-state";
import { AppContext } from "@/context/app-context";
import { isChunkLoadError, reloadForChunkError } from "@/lib/chunk-load-error";
import { getErrorReference } from "@/lib/error-reference";

type Level = "root" | "section" | "inline";

// React.lazy caches a failed import, so resetting the boundary cannot recover
// from a chunk error; only a full reload can.
function useRetry({ error, resetErrorBoundary }: FallbackProps) {
  return useEventCallback(() => {
    if (isChunkLoadError(error)) {
      window.location.reload();
      return;
    }
    resetErrorBoundary();
  });
}

function RootFallback(props: FallbackProps) {
  const { error } = props;
  const retry = useRetry(props);
  const goHome = useEventCallback(() => {
    window.location.href = "/";
  });

  return (
    <div className="flex min-w-0 flex-1 items-center justify-center">
      <ErrorState
        actions={
          <>
            <Button onClick={retry} type="button">
              Try again
            </Button>
            <Button onClick={goHome} type="button" variant="outline">
              Go to dashboard
            </Button>
          </>
        }
        error={error}
      />
    </div>
  );
}

function SectionFallback(props: FallbackProps) {
  const { error } = props;
  const retry = useRetry(props);
  const appCtx = use(AppContext);
  const canSeeErrors = appCtx?.hasPermission("settings.app_config") ?? false;

  return (
    <div className="border-destructive/40 bg-destructive/10 flex flex-col items-center gap-3 rounded-md border p-6 text-center">
      <HugeiconsIcon
        className="text-destructive size-6"
        icon={Alert01Icon}
        strokeWidth={2}
      />
      <p className="text-sm font-medium">Failed to load this section</p>
      <p className="text-muted-foreground max-w-sm text-xs">
        {canSeeErrors && error instanceof Error
          ? error.message
          : "An unexpected error occurred. Please try again."}
      </p>
      <Button onClick={retry} size="sm" type="button" variant="outline">
        Try again
      </Button>
    </div>
  );
}

function InlineFallback(props: FallbackProps) {
  const { error } = props;
  const retry = useRetry(props);
  const appCtx = use(AppContext);
  const canSeeErrors = appCtx?.hasPermission("settings.app_config") ?? false;

  return (
    <span className="text-destructive text-sm">
      Error
      {canSeeErrors && error instanceof Error ? `: ${error.message}` : ""}{" "}
      <button
        className="underline underline-offset-2"
        onClick={retry}
        type="button"
      >
        Retry
      </button>
    </span>
  );
}

const FALLBACK_MAP: Record<Level, (props: FallbackProps) => ReactNode> = {
  inline: InlineFallback,
  root: RootFallback,
  section: SectionFallback,
};

function handleError(error: unknown, info: { componentStack?: string | null }) {
  if (isChunkLoadError(error) && reloadForChunkError(error)) {
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  const traceId = getErrorReference(error);
  log.error({
    component: "AppErrorBoundary",
    componentStack: info.componentStack ?? "",
    message,
    traceId,
  });
  if (error instanceof Error) {
    import("@/lib/posthog")
      .then(({ captureException }) => captureException(error, { traceId }))
      .catch(() => {
        // Non-critical
      });
  }
}

export function AppErrorBoundary({
  children,
  level,
  onReset,
}: {
  children: ReactNode;
  level: Level;
  onReset?: () => void;
}) {
  return (
    <ErrorBoundary
      FallbackComponent={FALLBACK_MAP[level]}
      onError={handleError}
      onReset={onReset}
    >
      {children}
    </ErrorBoundary>
  );
}
