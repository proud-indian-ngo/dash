import { Alert01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { log } from "evlog";
import { type ReactNode, use, useState } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";

import {
  CHUNK_ERROR_DESCRIPTION,
  ErrorState,
  ReloadLabel,
} from "@/components/shared/error-state";
import { AppContext } from "@/context/app-context";
import {
  isChunkLoadError,
  reloadClearingCache,
  reloadForChunkError,
} from "@/lib/chunk-load-error";
import { getErrorReference } from "@/lib/error-reference";

type Level = "root" | "section" | "inline";

// React.lazy caches a failed import, so resetting the boundary cannot recover
// from a chunk error; only a full reload can.
// Clearing the cache first can take seconds, so the button shows it is working.
function useRetry({ error, resetErrorBoundary }: FallbackProps) {
  const [reloading, setReloading] = useState(false);
  const retry = useEventCallback(async () => {
    if (isChunkLoadError(error)) {
      setReloading(true);
      await reloadClearingCache();
      return;
    }
    resetErrorBoundary();
  });
  return { reloading, retry };
}

function RootFallback(props: FallbackProps) {
  const { error } = props;
  const { reloading, retry } = useRetry(props);
  const goHome = useEventCallback(() => {
    window.location.href = "/";
  });

  return (
    <div className="flex min-w-0 flex-1 items-center justify-center">
      <ErrorState
        actions={
          <>
            <Button disabled={reloading} onClick={retry} type="button">
              {isChunkLoadError(error) ? (
                <ReloadLabel reloading={reloading} />
              ) : (
                "Try again"
              )}
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
  const { reloading, retry } = useRetry(props);
  const appCtx = use(AppContext);
  const canSeeErrors = appCtx?.hasPermission("settings.app_config") ?? false;

  if (isChunkLoadError(error)) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border p-6 text-center">
        <HugeiconsIcon
          className="text-muted-foreground size-6"
          icon={RefreshIcon}
          strokeWidth={2}
        />
        <p className="text-sm font-medium">A new version is available</p>
        <p className="text-muted-foreground max-w-sm text-xs">
          {CHUNK_ERROR_DESCRIPTION}
        </p>
        <Button
          disabled={reloading}
          onClick={retry}
          size="sm"
          type="button"
          variant="outline"
        >
          <ReloadLabel reloading={reloading} />
        </Button>
      </div>
    );
  }

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
  const { reloading, retry } = useRetry(props);
  const appCtx = use(AppContext);
  const canSeeErrors = appCtx?.hasPermission("settings.app_config") ?? false;

  if (isChunkLoadError(error)) {
    return (
      <span className="text-muted-foreground text-sm">
        New version available.{" "}
        <button
          className="underline underline-offset-2"
          disabled={reloading}
          onClick={retry}
          type="button"
        >
          {reloading ? "Reloading" : "Reload"}
        </button>
      </span>
    );
  }

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
