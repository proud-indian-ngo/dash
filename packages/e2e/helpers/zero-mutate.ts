import { expect, type APIRequestContext } from "@playwright/test";

/**
 * Pushes one custom mutation straight to the app's Zero mutate endpoint with
 * the request context's session, as zero-cache would, and returns its result.
 * Lets a spec reach a server-side refusal the UI never offers.
 */
export async function pushMutation(
  request: APIRequestContext,
  name: string,
  args: Record<string, unknown>
): Promise<{ error?: string; message?: string }> {
  const suffix = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const response = await request.post(
    "/api/zero/mutate?schema=zero_0&appID=zero",
    {
      data: {
        clientGroupID: `e2e-cg-${suffix}`,
        mutations: [
          {
            args: [args],
            clientID: `e2e-client-${suffix}`,
            id: 1,
            name,
            timestamp: Date.now(),
            type: "custom",
          },
        ],
        pushVersion: 1,
        requestID: `e2e-req-${suffix}`,
        timestamp: Date.now(),
      },
    }
  );
  expect(response.ok()).toBe(true);
  const json = (await response.json()) as {
    mutations: { result: { error?: string; message?: string } }[];
  };
  const [mutation] = json.mutations;
  if (!mutation) {
    throw new Error(`No result for ${name}`);
  }
  return mutation.result;
}
