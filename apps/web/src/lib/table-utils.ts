import type { SetStateAction } from "react";

export const resolveUpdater = <T>(
  updater: SetStateAction<T>,
  previous: T
): T =>
  typeof updater === "function"
    ? (updater as (prev: T) => T)(previous)
    : updater;
