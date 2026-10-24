import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import { schema } from "@pi-dash/zero/schema";
import type { StorageFailureError, Zero } from "@rocicorp/zero";
import { ZeroProvider } from "@rocicorp/zero/react";
import { useRouter } from "@tanstack/react-router";
import { log } from "evlog";
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { invalidateAuthCache } from "@/lib/auth-cache";
import { authClient } from "@/lib/auth-client";
import {
  formatTraceparent,
  generateSpanId,
  generateTraceId,
} from "@/lib/tracing";

const DISCONNECT_TIMEOUT_MS = 5 * 60 * 1000;

// Called per WebSocket message (push, changeDesiredQueries, initConnection).
// Each message is a distinct traceable operation — new traceId per call is correct.
function getTraceparent(): string {
  return formatTraceparent(generateTraceId(), generateSpanId());
}

// Zero keeps running in memory, so unsent changes are lost on reload until
// local storage works again. Zero reports a failure once per instance.
function onStorageFailure(failure: StorageFailureError) {
  log.warn({
    component: "ZeroInit",
    message: "Zero local storage failed",
    kind: failure.kind,
    error: failure.message,
  });
  toast.warning(
    failure.kind === "full"
      ? "This device is out of storage. Stay online until your changes sync."
      : "This browser can't save dashboard data. Stay online until your changes sync."
  );
}

interface ZeroInitProps {
  children: ReactNode;
  onReady?: (zero: Zero) => void;
  permissions: string[];
  role: string | null | undefined;
  userId: string;
}

export function ZeroInit({
  children,
  onReady,
  permissions,
  role,
  userId,
}: ZeroInitProps) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const activeZero = useRef<Zero | undefined>(undefined);
  const invalidatedMismatch = useRef<string | null>(null);
  const zeroRole = role ?? "unoriented_volunteer";
  const sessionUserId = session?.user.id;
  const sessionRole = session?.user.role ?? "unoriented_volunteer";

  useEffect(() => {
    if (isPending) {
      return;
    }

    const expectedIdentity = `${userId}:${zeroRole}`;
    const actualIdentity = `${sessionUserId ?? "anonymous"}:${sessionRole}`;
    if (actualIdentity === expectedIdentity) {
      invalidatedMismatch.current = null;
      return;
    }
    if (invalidatedMismatch.current === actualIdentity) {
      return;
    }

    invalidatedMismatch.current = actualIdentity;
    invalidateAuthCache();
    void router.invalidate();
  }, [isPending, router, sessionRole, sessionUserId, userId, zeroRole]);

  const context = useMemo(
    () => ({ permissions, role: zeroRole, userId }),
    [permissions, userId, zeroRole]
  );

  const init = useCallback(
    (zero: Zero) => {
      activeZero.current = zero;
      onReady?.(zero);
      router.update({
        context: {
          ...router.options.context,
          zero,
        },
      });
      router.invalidate();
    },
    [onReady, router]
  );

  useEffect(
    () => () => {
      const zero = activeZero.current;
      if (router.options.context.zero === zero) {
        router.update({
          context: {
            ...router.options.context,
            zero: undefined,
          },
        });
      }
      activeZero.current = undefined;
    },
    [router]
  );

  return (
    <ZeroProvider
      cacheURL={env.VITE_ZERO_URL}
      context={context}
      // Keep queuing writes through a zero-cache restart; the default
      // rejects them after a minute
      disconnectTimeoutMs={DISCONNECT_TIMEOUT_MS}
      getTraceparent={getTraceparent}
      init={init}
      mutators={mutators}
      onStorageFailure={onStorageFailure}
      schema={schema}
      storageKey="pi-dash"
      userID={userId}
    >
      {children}
    </ZeroProvider>
  );
}
