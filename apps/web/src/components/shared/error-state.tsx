import { Alert02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { type ReactNode, use } from "react";
import { toast } from "sonner";

import { NotFoundState } from "@/components/shared/not-found-state";
import { AppContext } from "@/context/app-context";
import { getErrorReference } from "@/lib/error-reference";

/**
 * The page-level error block: the shared "nothing here" layout in the danger
 * tone, a reference people can copy and send us, and the raw message for
 * admins only.
 */
export function ErrorState({
  actions,
  error,
}: {
  actions: ReactNode;
  error: unknown;
}) {
  const appCtx = use(AppContext);
  const canSeeErrors = appCtx?.hasPermission("settings.app_config") ?? false;
  const reference = getErrorReference(error);
  const copyReference = useEventCallback(() => {
    navigator.clipboard
      .writeText(reference)
      .then(() => toast.success("Reference copied"))
      .catch(() => toast.error("Couldn't copy the reference"));
  });

  return (
    <NotFoundState
      actions={actions}
      description="Something went wrong on our side. Try again; if it keeps happening, send us the reference below."
      footer={
        <>
          <div className="flex items-center justify-center gap-2">
            <span>Reference</span>
            <code className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono break-all">
              {reference}
            </code>
            <Button
              onClick={copyReference}
              size="xs"
              type="button"
              variant="outline"
            >
              Copy
            </Button>
          </div>
          {canSeeErrors ? (
            <details className="mt-3 text-left">
              <summary className="cursor-pointer text-center">
                Error details
              </summary>
              <pre className="bg-muted text-foreground mt-2 max-h-40 overflow-auto rounded-md p-2 font-mono whitespace-pre-wrap">
                {error instanceof Error ? error.message : String(error)}
              </pre>
            </details>
          ) : null}
        </>
      }
      icon={Alert02Icon}
      iconClassName="bg-destructive/10 text-destructive"
      role="alert"
      title="This page couldn't load"
    />
  );
}
