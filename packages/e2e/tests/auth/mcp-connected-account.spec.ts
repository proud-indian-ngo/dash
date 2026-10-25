import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "@playwright/test";
import dotenv from "dotenv";

import {
  callTool,
  type McpToolResult,
  mcpPost,
  mcpRequest,
} from "../../helpers/mcp";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../../.env.test"),
  quiet: true,
});

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/mcp-oauth.ts"
);

async function fixture<T>(
  action: "cleanup" | "setup" | "state",
  argument?: string
) {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...(argument ? [argument] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

// Never reached: the spec intercepts the browser's return to the assistant.
const REDIRECT_URI = "http://127.0.0.1:9/e2e-assistant/callback";

const base64url = (bytes: Buffer) => bytes.toString("base64url");

test.describe("Connected assistant", () => {
  test.describe.configure({ mode: "serial" });

  let eventId: string;

  test.beforeAll(async () => {
    const creatorEmail = process.env.ADMIN_EMAIL;
    if (!creatorEmail) {
      throw new Error("ADMIN_EMAIL is required for the fixture");
    }
    ({ eventId } = await fixture<{ eventId: string }>("setup", creatorEmail));
  });

  test.afterAll(async () => {
    await fixture("cleanup");
  });

  test("an assistant connects a volunteer's account and shows interest for them", async ({
    page,
    request,
  }, testInfo) => {
    const email = process.env.VOLUNTEER_EMAIL ?? "";
    const password = process.env.VOLUNTEER_PASSWORD ?? "";

    // Without an account, account tools answer 401 with the challenge that
    // makes Claude ask the person to connect.
    const challenged = await mcpPost(request, "tools/call", {
      arguments: {},
      name: "my_interests",
    });
    expect(challenged.status()).toBe(401);
    const challenge = challenged.headers()["www-authenticate"] ?? "";

    // ChatGPT, which marks its calls with openai/ _meta, gets the challenge
    // in the tool result instead; it ignores the 401.
    const chatGptChallenged = await mcpRequest<McpToolResult>(
      request,
      "tools/call",
      {
        _meta: { "openai/session": "e2e", "openai/subject": "e2e" },
        arguments: {},
        name: "my_interests",
      }
    );
    expect(chatGptChallenged.isError).toBe(true);
    const inBandChallenge =
      chatGptChallenged._meta?.["mcp/www_authenticate"]?.[0] ?? "";
    expect(inBandChallenge).toContain('error="invalid_token"');
    expect(inBandChallenge).toContain("error_description=");
    expect(inBandChallenge).toContain("/.well-known/oauth-protected-resource");

    const metadataUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
    expect(metadataUrl).toContain("/.well-known/oauth-protected-resource");

    // Discovery, as an MCP client does it.
    const resourceMetadata = (await (
      await request.get(new URL(metadataUrl ?? "").pathname)
    ).json()) as { authorization_servers: string[]; resource: string };
    const issuer = new URL(resourceMetadata.authorization_servers[0] ?? "");
    const serverMetadata = (await (
      await request.get(
        `/.well-known/oauth-authorization-server${issuer.pathname}`
      )
    ).json()) as {
      authorization_endpoint: string;
      registration_endpoint: string;
      token_endpoint: string;
    };
    expect(serverMetadata.registration_endpoint).toBeTruthy();

    // Dynamic client registration, as ChatGPT and Claude do.
    const registered = await request.post(
      new URL(serverMetadata.registration_endpoint).pathname,
      {
        data: {
          client_name: "E2E Assistant",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: [REDIRECT_URI],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
      }
    );
    expect(registered.status()).toBe(201);
    const { client_id: clientId } = (await registered.json()) as {
      client_id: string;
    };

    // The server would fetch these URLs itself, so registration refuses them.
    const withLogoutUri = await request.post(
      new URL(serverMetadata.registration_endpoint).pathname,
      {
        data: {
          backchannel_logout_uri: "https://internal.example/logout",
          client_name: "E2E Assistant",
          redirect_uris: [REDIRECT_URI],
          token_endpoint_auth_method: "none",
        },
      }
    );
    expect(withLogoutUri.status()).toBe(400);

    const verifier = base64url(randomBytes(32));
    const challengeCode = base64url(
      createHash("sha256").update(verifier).digest()
    );
    const authorize = new URL(serverMetadata.authorization_endpoint);
    authorize.search = new URLSearchParams({
      client_id: clientId,
      code_challenge: challengeCode,
      code_challenge_method: "S256",
      redirect_uri: REDIRECT_URI,
      resource: resourceMetadata.resource,
      response_type: "code",
      scope: "openid profile email offline_access",
      state: "e2e-state",
    }).toString();

    let callback: URL | null = null;
    await page.route(`${new URL(REDIRECT_URI).origin}/**`, async (route) => {
      callback = new URL(route.request().url());
      await route.fulfill({ body: "Connected", contentType: "text/plain" });
    });

    // Signed out: sign in, then consent.
    await page.goto(`${authorize.pathname}${authorize.search}`);
    await page.waitForURL(/\/login\?/, { timeout: 30_000 });
    await page.getByLabel("Email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/\/oauth\/consent\?/, { timeout: 30_000 });
    await expect(
      page.getByRole("heading", {
        name: "E2E Assistant wants to use your Proud Indian account",
      })
    ).toBeVisible();
    await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
    await expect(
      page.getByText("Allowing takes you back to 127.0.0.1:9")
    ).toBeVisible();
    await page.getByRole("button", { name: "Allow" }).click();
    await expect
      .poll(() => callback?.searchParams.get("state"))
      .toBe("e2e-state");
    const code = (callback as URL | null)?.searchParams.get("code") ?? "";
    expect(code).not.toBe("");

    const tokenResponse = await request.post(
      new URL(serverMetadata.token_endpoint).pathname,
      {
        form: {
          client_id: clientId,
          code,
          code_verifier: verifier,
          grant_type: "authorization_code",
          redirect_uri: REDIRECT_URI,
          resource: resourceMetadata.resource,
        },
      }
    );
    expect(tokenResponse.status()).toBe(200);
    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
    };
    expect(tokens.refresh_token).toBeTruthy();
    const bearer = { authorization: `Bearer ${tokens.access_token}` };

    const shown = await callTool(request, "show_interest", { eventId }, bearer);
    expect(shown.isError).toBe(false);
    await expect
      .poll(async () => fixture("state", email), { timeout: 15_000 })
      .toEqual({ interestStatus: "pending" });

    // The app's own rules apply: a second request is refused.
    const again = await callTool(request, "show_interest", { eventId }, bearer);
    expect(again.isError).toBe(true);
    expect(again.content[0]?.text).toBe("Interest already submitted");

    const mine = await callTool(request, "my_interests", {}, bearer);
    const interests = (
      JSON.parse(mine.content[0]?.text ?? "{}") as {
        interests: { eventId: string; status: string }[];
      }
    ).interests;
    expect(interests).toContainEqual(
      expect.objectContaining({ eventId, status: "pending" })
    );

    // A forged token is refused like a missing one.
    const forged = await mcpPost(
      request,
      "tools/call",
      { arguments: {}, name: "my_interests" },
      { authorization: "Bearer not-a-token" }
    );
    expect(forged.status()).toBe(401);

    await testInfo.attach("connected-assistant.json", {
      body: JSON.stringify(
        {
          challenge,
          inBandChallenge,
          interestsAfter: interests,
          refusedSecondRequest: again.content[0]?.text,
          resource: resourceMetadata.resource,
        },
        null,
        2
      ),
      contentType: "application/json",
    });
  });
});
