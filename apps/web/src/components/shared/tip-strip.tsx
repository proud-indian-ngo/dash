import { BulbIcon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@pi-dash/design-system/lib/utils";
import { type ReactNode, useSyncExternalStore } from "react";

import { useApp } from "@/context/app-context";

const storageKey = (userId: string, tipId: string) =>
  `pi-dash:tip-dismissed:${userId}:${tipId}`;
const CHANGE_EVENT = "pi-dash:tip-dismissed";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readDismissed(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * One dismissible sentence under a page header that tells people something
 * they wouldn't otherwise find. Dismissal is remembered per person in this
 * browser. Each page shows at most one tip.
 */
export function TipStrip({
  action,
  children,
  className,
  id,
}: {
  /** An optional link or button after the sentence. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Stable id for this tip; changing it shows the tip again. */
  id: string;
}) {
  const { user } = useApp();
  const key = storageKey(user.id, id);
  // The server can't see storage, so it renders the tip; the browser then reads
  // storage straight away on client navigations, so a dismissed tip never
  // appears and an undismissed one never pushes the page down late.
  const dismissed = useSyncExternalStore(
    subscribe,
    () => readDismissed(key),
    () => false
  );

  if (dismissed) {
    return null;
  }

  const dismiss = () => {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Private mode or full storage: nothing to remember it in.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return (
    <aside
      aria-label="Tip"
      className={cn(
        "bg-info/10 text-info-foreground dark:bg-info/14 flex items-start gap-2.5 rounded-lg py-2 pr-1.5 pl-3 text-sm sm:items-center",
        className
      )}
    >
      <HugeiconsIcon
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 sm:mt-0"
        icon={BulbIcon}
        strokeWidth={2}
      />
      <p className="flex-1 text-pretty">
        {children}
        {action ? <span className="ml-2 font-medium">{action}</span> : null}
      </p>
      <button
        aria-label="Dismiss tip"
        className="hover:bg-info/15 focus-visible:ring-ring/50 inline-flex size-7 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-3 pointer-coarse:size-9"
        onClick={dismiss}
        type="button"
      >
        <HugeiconsIcon className="size-4" icon={Cancel01Icon} strokeWidth={2} />
      </button>
    </aside>
  );
}
