import { log } from "evlog";

import { invalidateAuthCache } from "@/lib/auth-cache";
import { authClient } from "@/lib/auth-client";

const loadPostHog = () => import("@/lib/posthog");

/** Clears this browser's synced data and session, then opens the login page. */
export async function signOut(zero: { delete: () => Promise<unknown> }) {
  try {
    await zero.delete();
  } catch (error: unknown) {
    log.error({
      action: "logout.clearCache",
      component: "signOut",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  await authClient.signOut({
    fetchOptions: {
      onSuccess: async () => {
        invalidateAuthCache();
        await loadPostHog()
          .then(({ resetUser }) => resetUser())
          .catch(() => {
            // Non-critical
          });
        window.location.replace("/login");
      },
    },
  });
}
