import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { VOTE_REAUTH_MESSAGE } from "@pi-dash/shared/resolutions";
import { log } from "evlog";
import { type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { useApp } from "@/context/app-context";
import { authClient } from "@/lib/auth-client";

/**
 * Voting and signing need a sign-in from the last 10 minutes. `runVote`
 * runs the action; when the server asks for a fresh sign-in, it asks for
 * the password, signs in again and runs the action once more.
 */
export function useVoteReauth(): {
  dialog: ReactNode;
  runVote: <T>(action: () => Promise<T>) => Promise<T | null>;
} {
  const { user } = useApp();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const askForPassword = () =>
    new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setPassword("");
      setOpen(true);
    });

  const finish = (ok: boolean) => {
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  };

  const handleSubmit = useEventCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setPending(true);
      const result = await authClient.signIn.email({
        email: user.email,
        password,
      });
      setPending(false);
      if (result.error) {
        log.error({
          action: "vote.reauth",
          component: "useVoteReauth",
          error: result.error.message ?? "sign-in failed",
        });
        toast.error("That password didn't work.");
        return;
      }
      finish(true);
    }
  );
  const handleOpenChange = useEventCallback((next: boolean) => {
    if (!next) {
      finish(false);
    }
  });

  const runVote = useEventCallback(
    async <T,>(action: () => Promise<T>): Promise<T | null> => {
      try {
        return await action();
      } catch (error) {
        if (
          !(error instanceof Error && error.message === VOTE_REAUTH_MESSAGE)
        ) {
          throw error;
        }
        if (!(await askForPassword())) {
          return null;
        }
        return await action();
      }
    }
  );

  const dialog = (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-sm)">
        <DialogHeader>
          <DialogTitle>Confirm it's you</DialogTitle>
          <DialogDescription>
            Enter your password to vote or sign. This keeps a shared or
            unattended laptop from casting your vote.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vote-reauth-password">Password</Label>
            <Input
              autoComplete="current-password"
              autoFocus
              id="vote-reauth-password"
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              value={password}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => finish(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={pending || !password} type="submit">
              {pending ? "Checking..." : "Continue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  return { dialog, runVote };
}
