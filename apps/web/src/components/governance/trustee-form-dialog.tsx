import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import {
  getTrusteeAccountOptions,
  getTrusteeDetails,
  type TrusteeDetailsResponse,
} from "@/functions/governance";

import type { RegisterTrustee } from "./register-data";

const loadTrusteeForm = () => import("./trustee-form");

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | {
      accounts: Awaited<ReturnType<typeof getTrusteeAccountOptions>>;
      context: TrusteeDetailsResponse;
      Form: typeof import("./trustee-form").TrusteeForm;
      kind: "ready";
    };

export function TrusteeFormDialog({
  onOpenChange,
  onSaved,
  open,
  trustee,
}: {
  onOpenChange: (open: boolean) => void;
  onSaved: (trusteeId: string) => void;
  open: boolean;
  trustee: RegisterTrustee | null;
}) {
  const loadDetails = useServerFn(getTrusteeDetails);
  const loadAccounts = useServerFn(getTrusteeAccountOptions);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const trusteeId = trustee?.id ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    Promise.all([
      loadDetails({ data: { trusteeId } }),
      loadAccounts(),
      loadTrusteeForm(),
    ])
      .then(([context, accounts, { TrusteeForm }]) => {
        if (!cancelled) {
          setState({ accounts, context, Form: TrusteeForm, kind: "ready" });
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "trustee.loadDetails",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "TrusteeFormDialog",
        });
        if (!cancelled) {
          // Never show an empty form for an existing trustee: saving it
          // would wipe the stored details.
          setState({ kind: "error" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, trusteeId, attempt, loadDetails, loadAccounts]);

  const retry = useEventCallback(() => setAttempt((n) => n + 1));

  let body: React.ReactNode;
  if (state.kind === "ready") {
    const Form = state.Form;
    body = (
      <Form
        accounts={state.accounts}
        context={state.context}
        key={`${trusteeId ?? "new"}-${attempt}`}
        onOpenChange={onOpenChange}
        onSaved={onSaved}
        trustee={trustee}
      />
    );
  } else if (state.kind === "error") {
    body = (
      <div className="flex flex-col items-start gap-3 px-1 py-4">
        <p className="text-destructive text-sm">
          Couldn't load the trustee's details.
        </p>
        <Button onClick={retry} size="sm" type="button" variant="outline">
          Try again
        </Button>
      </div>
    );
  } else {
    body = <p className="text-muted-foreground px-1 py-6 text-sm">Loading…</p>;
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-lg)">
        <DialogHeader>
          <DialogTitle>{trustee ? "Edit trustee" : "Add trustee"}</DialogTitle>
          <DialogDescription className="sr-only">
            {trustee
              ? "Edit the trustee's name, account, contact and KYC details"
              : "Add a person to the trustee register"}
          </DialogDescription>
        </DialogHeader>
        {open ? body : null}
      </DialogContent>
    </Dialog>
  );
}
