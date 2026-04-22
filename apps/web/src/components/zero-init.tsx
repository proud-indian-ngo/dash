import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import { schema } from "@pi-dash/zero/schema";
import type { Zero } from "@rocicorp/zero";
import { ZeroProvider } from "@rocicorp/zero/react";
import { useRouter } from "@tanstack/react-router";
import { log } from "evlog";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getPermissions } from "@/functions/get-permissions";
import { authClient } from "@/lib/auth-client";
import {
  formatTraceparent,
  generateSpanId,
  generateTraceId,
} from "@/lib/tracing";

// Called per WebSocket message (push, changeDesiredQueries, initConnection).
// Each message is a distinct traceable operation — new traceId per call is correct.
function getTraceparent(): string {
  return formatTraceparent(generateTraceId(), generateSpanId());
}

interface ZeroInitProps {
  children: ReactNode;
}

export function ZeroInit({ children }: ZeroInitProps) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const role = session?.user.role ?? "unoriented_volunteer";
  const userID = session?.user.id ?? "anon";
  const [permissions, setPermissions] = useState<string[]>([]);

  const userId = session?.user?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-fetch permissions when role changes
  useEffect(() => {
    if (!userId) {
      return;
    }
    getPermissions()
      .then(setPermissions)
      .catch((error: unknown) => {
        log.error({
          component: "ZeroInit",
          action: "getPermissions",
          error: error instanceof Error ? error.message : String(error),
        });
        setPermissions([]);
      });
  }, [userId, role]);

  const context = useMemo(
    () =>
      userID === "anon"
        ? { permissions: [], role: "unoriented_volunteer", userId: "anon" }
        : { permissions, role, userId: userID },
    [permissions, role, userID]
  );

  const init = useCallback(
    (zero: Zero) => {
      router.update({
        context: {
          ...router.options.context,
          zero,
        },
      });
      router.invalidate();
    },
    [router]
  );

  return (
    <ZeroProvider
      cacheURL={env.VITE_ZERO_URL}
      context={context}
      getTraceparent={getTraceparent}
      init={init}
      mutators={mutators}
      schema={schema}
      storageKey="pi-dash"
      userID={userID}
    >
      {children}
    </ZeroProvider>
  );
}
