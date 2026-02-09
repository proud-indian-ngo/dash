import { type SetStateAction, useEffect, useState } from "react";

interface UseLocalStorageOptions<T> {
  deserialize?: (value: string) => T | undefined;
  serialize?: (value: T) => string;
}

const defaultDeserialize = <T>(value: string): T | undefined => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

const defaultSerialize = <T>(value: T): string => {
  return JSON.stringify(value);
};

export function useLocalStorage<T>(
  key: string | undefined,
  initialValue: T,
  options: UseLocalStorageOptions<T> = {}
): [T, (value: SetStateAction<T>) => void] {
  const deserialize = options.deserialize ?? defaultDeserialize<T>;
  const serialize = options.serialize ?? defaultSerialize<T>;

  const [storedValue, setStoredValue] = useState<T>(() => {
    if (!key || typeof window === "undefined") {
      return initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      return item === null ? initialValue : (deserialize(item) ?? initialValue);
    } catch {
      return initialValue;
    }
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: initialValue identity changes should not force storage re-read.
  useEffect(() => {
    if (!key || typeof window === "undefined") {
      return;
    }

    try {
      const item = window.localStorage.getItem(key);
      setStoredValue(
        item === null ? initialValue : (deserialize(item) ?? initialValue)
      );
    } catch {
      setStoredValue(initialValue);
    }
  }, [key, deserialize]);

  useEffect(() => {
    if (!key || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(key, serialize(storedValue));
    } catch {
      // Ignore write errors (e.g. storage full/private mode restrictions).
    }
  }, [key, serialize, storedValue]);

  return [storedValue, setStoredValue];
}
