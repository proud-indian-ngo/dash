import { mock } from "bun:test";

import type { SocialAuthorize } from "./shared";

export const TEST_TOKEN = {
  id: "019a0000-0000-7000-8000-0000000000aa",
  name: "social-artifacts",
  scopes: [
    "events:read" as const,
    "photos:read" as const,
    "social:write" as const,
  ],
};

/** Authorize stub: grants the test token, or answers with `status`. */
export function stubAuthorize(status?: number) {
  return mock<SocialAuthorize>(async () =>
    status
      ? { error: Response.json({ error: "denied" }, { status }) }
      : { token: TEST_TOKEN }
  );
}
