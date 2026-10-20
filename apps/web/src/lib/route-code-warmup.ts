import type { AnyRouter } from "@tanstack/react-router";
import { log } from "evlog";

const QUIET_PERIOD_MS = 2000;

/** Warm code only, yielding between routes and whenever the user is active. */
export function startRouteCodeWarmup(
  router: AnyRouter,
  paths: readonly string[]
): () => void {
  const connection = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean };
    }
  ).connection;
  if (
    connection?.saveData ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g"
  ) {
    return () => {};
  }

  const seen = new Set(router.state.matches.map((match) => match.routeId));
  const routes = paths.flatMap((path) => {
    const [matches] = router.getMatchedRoutes(path);
    return matches.filter((route) => {
      if (seen.has(route.id)) {
        return false;
      }
      seen.add(route.id);
      return true;
    });
  });
  let stopped = false;
  let loading = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idleCallback: number | undefined;

  function cancelScheduled() {
    clearTimeout(timer);
    timer = undefined;
    if (idleCallback !== undefined) {
      window.cancelIdleCallback(idleCallback);
      idleCallback = undefined;
    }
  }

  function canWarm() {
    return document.visibilityState === "visible" && navigator.onLine;
  }

  async function loadNext() {
    idleCallback = undefined;
    if (stopped || !canWarm()) {
      return;
    }
    if (router.state.isLoading) {
      schedule();
      return;
    }
    const route = routes.shift();
    if (!route) {
      return;
    }
    loading = true;
    try {
      await router.loadRouteChunk(route);
    } catch (error) {
      log.error({
        action: "loadRouteChunk",
        component: "BackgroundRouteWarmup",
        error: error instanceof Error ? error.message : String(error),
        routeId: route.id,
      });
    } finally {
      loading = false;
      schedule();
    }
  }

  function schedule() {
    cancelScheduled();
    if (stopped || loading || routes.length === 0 || !canWarm()) {
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      if (window.requestIdleCallback) {
        idleCallback = window.requestIdleCallback(() => {
          void loadNext();
        });
      } else {
        void loadNext();
      }
    }, QUIET_PERIOD_MS);
  }

  const unsubscribe = router.subscribe("onBeforeNavigate", schedule);
  document.addEventListener("pointerdown", schedule, { passive: true });
  document.addEventListener("keydown", schedule);
  document.addEventListener("scroll", schedule, {
    capture: true,
    passive: true,
  });
  document.addEventListener("visibilitychange", schedule);
  window.addEventListener("online", schedule);
  window.addEventListener("offline", schedule);
  schedule();

  return () => {
    stopped = true;
    cancelScheduled();
    unsubscribe();
    document.removeEventListener("pointerdown", schedule);
    document.removeEventListener("keydown", schedule);
    document.removeEventListener("scroll", schedule, true);
    document.removeEventListener("visibilitychange", schedule);
    window.removeEventListener("online", schedule);
    window.removeEventListener("offline", schedule);
  };
}
