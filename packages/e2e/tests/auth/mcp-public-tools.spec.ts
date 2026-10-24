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
        annotations?: { readOnlyHint?: boolean };
        name: string;
      }[];
    }>(request, "tools/list");
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "about_proud_indian",
      "get_donation_link",
      "list_upcoming_sessions",
    ]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
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
    expect(donate.content[0]?.text).toBe("https://proudindian.ngo/donate");

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
          sessions: fromTool.length,
          tools: names,
        },
        null,
        2
      ),
      contentType: "application/json",
    });
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
