import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { FocusEvent, PointerEvent, ReactNode } from "react";
import { useEffect, useMemo } from "react";

import { createReimbursementRowIntentController } from "./reimbursement-row-intent";

const ROW_MARKER = "[data-reimbursement-intent-id]";

function requestIdFromTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) {
    return null;
  }
  return (
    target.closest("tr")?.querySelector<HTMLElement>(ROW_MARKER)?.dataset
      .reimbursementIntentId ?? null
  );
}

export function ReimbursementRowIntentBoundary({
  children,
  onIntent,
}: {
  children: ReactNode;
  onIntent: (id: string) => void;
}) {
  const stableOnIntent = useEventCallback(onIntent);
  const controller = useMemo(
    () => createReimbursementRowIntentController(stableOnIntent),
    [stableOnIntent]
  );

  useEffect(() => () => controller.dispose(), [controller]);

  const handlePointerOver = (event: PointerEvent<HTMLDivElement>) => {
    const id = requestIdFromTarget(event.target);
    const previousId = requestIdFromTarget(event.relatedTarget);
    if (id && id !== previousId) {
      controller.pointerEnter(id, event.pointerType);
    }
  };
  const handlePointerOut = (event: PointerEvent<HTMLDivElement>) => {
    const id = requestIdFromTarget(event.target);
    if (id) {
      controller.pointerLeave(id, requestIdFromTarget(event.relatedTarget));
    }
  };
  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (
      event.target instanceof HTMLElement &&
      event.target.tagName === "TR" &&
      event.target.matches(":focus-visible")
    ) {
      const id = requestIdFromTarget(event.target);
      if (id) {
        controller.focus(id);
      }
    }
  };

  return (
    <div
      onFocusCapture={handleFocus}
      onPointerDownCapture={controller.cancelPending}
      onPointerOut={handlePointerOut}
      onPointerOver={handlePointerOver}
    >
      {children}
    </div>
  );
}
