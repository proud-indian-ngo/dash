import { useCallback, useRef } from "react";

export function useEventCallback<T extends (...args: never[]) => unknown>(
  callback: T
): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback(((...args) => callbackRef.current(...args)) as T, []);
}
