import { todayInKolkata } from "@pi-dash/shared/income";
import { useEffect, useState } from "react";

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Today in India time as yyyy-MM-dd, kept current: it moves at the next
 * India midnight, and is checked again when a suspended tab comes back.
 */
export function useIndiaToday(): string {
  const [today, setToday] = useState(todayInKolkata);
  useEffect(() => {
    const refresh = () => setToday(todayInKolkata());
    const untilMidnight =
      DAY_MS - ((Date.now() + IST_OFFSET_MS) % DAY_MS) + 1000;
    const timer = setTimeout(refresh, untilMidnight);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [today]);
  return today;
}
