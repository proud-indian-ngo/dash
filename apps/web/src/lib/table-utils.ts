import type { SetStateAction } from "react";

export const resolveUpdater = <T>(
  updater: SetStateAction<T>,
  previous: T
): T => {
  return typeof updater === "function"
    ? (updater as (prev: T) => T)(previous)
    : updater;
};
