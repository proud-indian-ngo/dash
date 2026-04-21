import { Alert01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { log } from "evlog";
import { type ReactNode, use } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { AppContext } from "@/context/app-context";

type Level = "root" | "section" | "inline";

function RootFallback({ error, resetErrorBoundary }: FallbackProps) {
  const appCtx = use(AppContext);
  const canSeeErrors = appCtx?.hasPermission("settings.app_config") ?? false;

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <HugeiconsIcon
          className="size-10 text-destructive"
          icon={Alert01Icon}
          strokeWidth={2}
        />
        <h2 className="font-semibold text-lg">We hit an unexpected error</h2>
        <p className="max-w-md text-muted-foreground text-sm">
          This page couldn't load properly. Try again, or head back to the home
          page if the problem persists.
        </p>
        {canSeeErrors ? (
          <p className="mt-2 max-w-md rounded-md bg-muted p-2 font-mono text-muted-foreground text-xs">
            {error instanceof Error ? error.message : String(error)}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={resetErrorBoundary} type="button">
          Try Again
        </Button>
        <Button
          onClick={() => {
            window.location.href = "/";
          }}
          type="button"
          variant="secondary"
        >
          Home
        </Button>
      </div>
    </div>
  );
}

function SectionFallback({ error, resetErrorBoundary }: FallbackProps) {
  const appCtx = use(AppContext);
  const canSeeErrors = appCtx?.hasPermission("settings.app_config") ?? false;

  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-6 text-center">
      <HugeiconsIcon
        className="size-6 text-destructive"
        icon={Alert01Icon}
        strokeWidth={2}
      />
      <p className="font-medium text-sm">Failed to load this section</p>
      <p className="max-w-sm text-muted-foreground text-xs">
        {canSeeErrors && error instanceof Error
          ? error.message
          : "An unexpected error occurred. Please try again."}
      </p>
      <Button
        onClick={resetErrorBoundary}
        size="sm"
        type="button"
        variant="outline"
      >
        Try Again
      </Button>
    </div>
  );
}

function InlineFallback({ error, resetErrorBoundary }: FallbackProps) {
  const appCtx = use(AppContext);
  const canSeeErrors = appCtx?.hasPermission("settings.app_config") ?? false;

  return (
    <span className="text-destructive text-sm">
      Error
      {canSeeErrors && error instanceof Error ? `: ${error.message}` : ""}{" "}
      <button
        className="underline underline-offset-2"
        onClick={resetErrorBoundary}
        type="button"
      >
        Retry
      </button>
    </span>
  );
}

const FALLBACK_MAP: Record<Level, (props: FallbackProps) => ReactNode> = {
  root: RootFallback,
  section: SectionFallback,
  inline: InlineFallback,
};

function handleError(error: unknown, info: { componentStack?: string | null }) {
  const message = error instanceof Error ? error.message : String(error);
  log.error({
    component: "AppErrorBoundary",
    message,
    componentStack: info.componentStack ?? "",
  });
  if (error instanceof Error) {
    Promise.all([import("@/lib/posthog"), import("@/lib/tracing")])
      .then(([{ captureException }, { generateTraceId }]) =>
        captureException(error, { traceId: generateTraceId() })
      )
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
