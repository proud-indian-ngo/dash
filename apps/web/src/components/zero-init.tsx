import type { UserRole } from "@pi-dash/db/schema/auth";
import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import { schema } from "@pi-dash/zero/schema";
import type { Zero } from "@rocicorp/zero";
import { ZeroProvider } from "@rocicorp/zero/react";
import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { authClient } from "@/lib/auth-client";

interface ZeroInitProps {
  children: ReactNode;
}

export function ZeroInit({ children }: ZeroInitProps) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const role = (session?.user.role ?? "volunteer") as UserRole;
  const userID = session?.user.id ?? "anon";
  const context = useMemo(() => {
    if (!session) {
      return {
        userId: "anon",
      };
    }

    return {
      role,
      userId: session.user.id,
    };
  }, [role, session]);
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
      cacheURL={env.VITE_PUBLIC_ZERO_CACHE_URL}
      context={context}
      init={init}
      mutators={mutators}
      schema={schema}
      userID={userID}
    >
      {children}
    </ZeroProvider>
  );
}
