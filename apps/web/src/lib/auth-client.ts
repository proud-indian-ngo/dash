import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import type { auth } from "@pi-dash/auth";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<typeof auth>(),
    adminClient(),
    // Sends the signed OAuth query from the login and consent pages, so an
    // assistant's connect flow continues after sign-in (assistants.md).
    oauthProviderClient(),
  ],
});
