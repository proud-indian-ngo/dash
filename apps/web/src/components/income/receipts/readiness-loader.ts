/**
 * Schedules the Receipt column's readiness requests: debounced, never two
 * at once (a request asked for while one runs becomes one trailing call),
 * and skipped while the tab is hidden: showing it again loads afresh,
 * since donor details may have changed elsewhere meanwhile. Kept free of
 * React so the timing and error paths are unit-tested.
 */
export interface ReadinessLoaderOptions<T> {
  debounceMs: number;
  isHidden: () => boolean;
  load: () => Promise<T>;
  onError: (error: unknown) => void;
  onResult: (result: T) => void;
}

export interface ReadinessLoader {
  /** Ask for a load after the debounce (also when the tab is shown again). */
  request: () => void;
  /** Stop: drop timers and ignore any answer still on its way. */
  dispose: () => void;
}

export function createReadinessLoader<T>(
  options: ReadinessLoaderOptions<T>
): ReadinessLoader {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let trailing = false;
  let disposed = false;

  const fire = () => {
    if (disposed) {
      return;
    }
    if (options.isHidden()) {
      return;
    }
    if (inFlight) {
      trailing = true;
      return;
    }
    inFlight = true;
    options
      .load()
      .then((result) => {
        if (!disposed) {
          options.onResult(result);
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          options.onError(error);
        }
      })
      .finally(() => {
        inFlight = false;
        if (trailing && !disposed) {
          trailing = false;
          fire();
        }
      });
  };

  const request = () => {
    if (disposed) {
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      fire();
    }, options.debounceMs);
  };

  return {
    dispose: () => {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    request,
  };
}
