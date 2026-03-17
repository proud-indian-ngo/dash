import { Alert01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  type ErrorComponentProps,
  Link,
  rootRouteId,
  useCanGoBack,
  useMatch,
  useRouter,
} from "@tanstack/react-router";
import { log } from "evlog";
import { useContext, useEffect, useRef } from "react";
import { AppContext } from "@/context/app-context";

export function DefaultCatchBoundary({ error }: Readonly<ErrorComponentProps>) {
  const router = useRouter();
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  });

  const appCtx = useContext(AppContext);
  const isAdmin = appCtx?.isAdmin ?? false;

  const canGoBack = useCanGoBack();

  const loggedErrorRef = useRef<unknown>(null);

  useEffect(() => {
    if (loggedErrorRef.current !== error) {
      loggedErrorRef.current = error;
      log.error({
        component: "DefaultCatchBoundary",
        message: error instanceof Error ? error.message : String(error),
        route: typeof window === "undefined" ? "" : window.location.pathname,
      });
    }
  }, [error]);

  return (
    <div
      className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 p-4"
      role="alert"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <HugeiconsIcon
          className="size-10 text-destructive"
          icon={Alert01Icon}
          strokeWidth={2}
        />
        <h2 className="font-semibold text-lg">Something went wrong</h2>
        <p className="max-w-md text-muted-foreground text-sm">
          An unexpected error occurred. Please try again or return to the home
          page.
        </p>
        {isAdmin ? (
          <p className="mt-2 max-w-md rounded-md bg-muted p-2 font-mono text-muted-foreground text-xs">
            {error instanceof Error ? error.message : String(error)}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={async () => {
            await router.invalidate();
          }}
          type="button"
        >
          Try Again
        </Button>
        {!isRoot && canGoBack ? (
          <Button
            nativeButton={false}
            render={
              <Link
                onClick={(e) => {
                  e.preventDefault();
                  window.history.back();
                }}
                to="/"
              />
            }
            variant="secondary"
          >
            Go Back
          </Button>
        ) : null}
        <Button
          nativeButton={false}
          render={<Link to="/" />}
          variant="secondary"
        >
          Home
        </Button>
      </div>
    </div>
  );
}
