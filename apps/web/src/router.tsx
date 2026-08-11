import type { Zero } from "@rocicorp/zero";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { DefaultCatchBoundary } from "@/components/default-catch-boundary";
import { DefaultNotFound } from "@/components/default-not-found";
import { Loader } from "./components/loader";
import { routeTree } from "./routeTree.gen";

export interface RouterContext {
  zero: Zero;
}

export const getRouter = () => {
  const router = createTanStackRouter({
    context: {
      zero: undefined as unknown as Zero, // populated in ZeroInit,
    } satisfies RouterContext,
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: DefaultNotFound,
    defaultPendingComponent: Loader,
    defaultPendingMinMs: 200,
    defaultPendingMs: 100,
    defaultPreload: import.meta.env.VITE_E2E ? false : "viewport",
    // We don't want TanStack skipping any calls to us. We want to be asked to
    // preload every link. This is fine because Zero has its own internal
    // deduping and caching.
    defaultPreloadGcTime: 0,
    // It is fine to call Zero multiple times for same query, Zero dedupes the
    // queries internally.
    defaultPreloadStaleTime: 0,
    defaultStructuralSharing: true,
    defaultViewTransition: true,
    routeTree,
    scrollRestoration: true,
  });
  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

declare module "@tanstack/react-start" {
  interface Register {
    router: Awaited<ReturnType<typeof getRouter>>;
    ssr: true;
  }
}
