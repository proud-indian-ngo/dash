import { useLocation } from "@tanstack/react-router";
import { useEffect, useSyncExternalStore } from "react";

interface RecordTitle {
  pathname: string;
  title: string;
}

let current: RecordTitle | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return current;
}

function getServerSnapshot() {
  return null;
}

/**
 * Names the record this page shows ("Events & Outreach", not "Team
 * Details"), so the breadcrumb's last crumb can say it. Pass `undefined`
 * until the record has loaded.
 */
export function useRecordTitle(title: string | null | undefined) {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!title) {
      return;
    }
    const entry = { pathname, title };
    current = entry;
    emit();
    return () => {
      if (current === entry) {
        current = null;
        emit();
      }
    };
  }, [pathname, title]);
}

/** The open record's title, when it belongs to `pathname`. */
export function useCurrentRecordTitle(pathname: string): string | undefined {
  const entry = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return entry?.pathname === pathname ? entry.title : undefined;
}
