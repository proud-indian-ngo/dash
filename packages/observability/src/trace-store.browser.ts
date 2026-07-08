export function runWithTraceId<T>(_traceId: string, fn: () => T): T {
  return fn();
}

export const getCurrentTraceId = (): undefined => undefined;
