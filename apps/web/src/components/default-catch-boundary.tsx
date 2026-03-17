import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  ErrorComponent,
  type ErrorComponentProps,
  Link,
  rootRouteId,
  useMatch,
  useRouter,
} from "@tanstack/react-router";
import { log } from "evlog";
import { useEffect, useRef } from "react";

export function DefaultCatchBoundary({ error }: Readonly<ErrorComponentProps>) {
  const router = useRouter();
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  });

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
      <ErrorComponent error={error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={async () => {
            await router.invalidate();
          }}
          type="button"
        >
          Try Again
        </Button>
        {isRoot ? (
          <Button
            nativeButton={false}
            render={<Link to="/" />}
            variant="secondary"
          >
            Home
          </Button>
        ) : (
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
        )}
      </div>
    </div>
  );
}
