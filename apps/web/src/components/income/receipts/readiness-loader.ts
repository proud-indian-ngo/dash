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
  /** `seq`: the failed load's start number (see `started`). */
  onError: (error: unknown, seq: number) => void;
  /** `seq`: the answering load's start number (see `started`). */
  onResult: (result: T, seq: number) => void;
}

export interface ReadinessLoader {
  /** Ask for a load after the debounce (also when the tab is shown again). */
  request: () => void;
  /**
   * How many loads have started. A load whose `seq` is above the value read
   * at some moment started after that moment, so its answer reflects
   * anything requested then.
   */
  started: () => number;
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
  let startedCount = 0;

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
    startedCount += 1;
    const seq = startedCount;
    options
      .load()
      .then((result) => {
        if (!disposed) {
          options.onResult(result, seq);
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          options.onError(error, seq);
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
    started: () => startedCount,
  };
}
