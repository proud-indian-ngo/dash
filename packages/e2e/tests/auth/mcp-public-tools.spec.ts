import { expect, test } from "@playwright/test";

import { callTool, MCP_PROTOCOL_VERSION, mcpRequest } from "../../helpers/mcp";

interface FeedEvent {
  id: string;
  occurrenceDate: string;
  signUpUrl: string;
  team: string;
}

// Seeded and read-only for specs, so its sessions don't change mid-test.
const STABLE_TEAM = "E2E Updates Team";

test.describe("MCP public tools", () => {
  test("an assistant connects, lists sessions, reads about Proud Indian and gets the donation link", async ({
    request,
  }, testInfo) => {
    const initialized = await mcpRequest<{
      protocolVersion: string;
      serverInfo: { name: string };
    }>(request, "initialize", {
      capabilities: {},
      clientInfo: { name: "e2e", version: "1.0.0" },
      protocolVersion: MCP_PROTOCOL_VERSION,
    });
    expect(initialized.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(initialized.serverInfo.name).toBe("proud-indian");

    const { tools } = await mcpRequest<{
      tools: {
        annotations?: {
          openWorldHint?: boolean;
          readOnlyHint?: boolean;
          title?: string;
        };
        name: string;
        title?: string;
      }[];
    }>(request, "tools/list");
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "about_proud_indian",
      "get_donation_link",
      "list_upcoming_sessions",
      "my_interests",
      "show_interest",
      "start_volunteer_signup",
    ]);
    // Only signing up and showing interest write. ChatGPT reads the title at
    // the top level, Claude's directory in the annotations.
    for (const tool of tools) {
      expect(tool.title).toBeTruthy();
      expect(tool.annotations?.title).toBe(tool.title);
      // Sign-up emails whatever address the person gives: an open world.
      expect(tool.annotations?.openWorldHint).toBe(
        tool.name === "start_volunteer_signup"
      );
      expect(tool.annotations?.readOnlyHint).toBe(
        !["show_interest", "start_volunteer_signup"].includes(tool.name)
      );
    }

    // The tool lists exactly what the website's feed lists.
    const listed = await callTool(request, "list_upcoming_sessions", {
      days: 30,
      limit: 50,
    });
    expect(listed.isError).toBeFalsy();
    const fromTool = (
      JSON.parse(listed.content[0]?.text ?? "{}") as { events: FeedEvent[] }
    ).events.filter((e) => e.team === STABLE_TEAM);
    const feed = await request.get("/api/public/events?days=30&limit=50");
    expect(feed.status()).toBe(200);
    const fromFeed = ((await feed.json()) as { events: FeedEvent[] }).events
      .filter((e) => e.team === STABLE_TEAM)
      .map(({ id, occurrenceDate, signUpUrl }) => ({
        id,
        occurrenceDate,
        signUpUrl,
      }));
    expect(fromTool.length).toBeGreaterThan(0);
    expect(
      fromTool.map(({ id, occurrenceDate, signUpUrl }) => ({
        id,
        occurrenceDate,
        signUpUrl,
      }))
    ).toEqual(fromFeed);
    for (const event of fromTool) {
      expect(new URL(event.signUpUrl).searchParams.get("interestEventId")).toBe(
        event.id
      );
    }

    const badCity = await callTool(request, "list_upcoming_sessions", {
      city: "XYZ",
    });
    expect(badCity.isError).toBe(true);
    expect(badCity.content[0]?.text).toContain("city must be one of");

    const donate = await callTool(request, "get_donation_link");
    expect(donate.content[0]?.text).toBe("https://proudindian.ngo/#donate");

    // The ChatGPT plugin portal's domain check reads the token as plain text.
    const challenge = await request.get("/.well-known/openai-apps-challenge");
    expect(challenge.status()).toBe(200);
    expect(await challenge.text()).toBe(process.env.OPENAI_APPS_CHALLENGE);

    // Fetched from the website; offline, the tool names the website instead.
    const about = await callTool(request, "about_proud_indian");
    expect(about.content[0]?.text).toContain(
      about.isError ? "https://proudindian.ngo" : "# Proud Indian"
    );

    await testInfo.attach("mcp-public-tools.json", {
      body: JSON.stringify(
        {
          aboutFromWebsite: !about.isError,
          donate: donate.content[0]?.text,
          openAiChallenge: challenge.status(),
          sessions: fromTool.length,
          tools: names,
        },
        null,
        2
      ),
      contentType: "application/json",
    });
  });

  test("an agent that looks for /auth.md is pointed at the MCP server", async ({
    request,
  }) => {
    const response = await request.get("/auth.md");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/markdown");
    const body = await response.text();
    expect(body).toContain("/api/mcp");
    expect(body).toContain("start_volunteer_signup");
    expect(body).toContain("signUpUrl");
  });

  test("a browser page on another site can't call it", async ({ request }) => {
    const response = await request.post("/api/mcp", {
      data: { id: 1, jsonrpc: "2.0", method: "tools/list" },
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": MCP_PROTOCOL_VERSION,
        origin: "https://evil.example",
      },
    });
    expect(response.status()).toBe(403);
  });
});
