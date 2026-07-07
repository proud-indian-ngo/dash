export function runWithTraceId<T>(_traceId: string, fn: () => T): T {
  return fn();
}

export function getCurrentTraceId(): string | undefined {
  return undefined;
}
