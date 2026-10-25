import type { APIRequestContext, APIResponse } from "@playwright/test";

/**
 * A minimal MCP client over HTTP for specs: stateless JSON-RPC posts to
 * `/api/mcp`, as ChatGPT and Claude send them (2025-06-18 protocol).
 */

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export interface McpToolResult {
  _meta?: { "mcp/www_authenticate"?: string[] };
  content: { text: string; type: string }[];
  isError?: boolean;
}

interface JsonRpcResponse<T> {
  error?: { code: number; message: string };
  id: number;
  result?: T;
}

let nextId = 1;

/** The JSON-RPC message in a JSON or single-event SSE response. */
async function readMessage<T>(response: APIResponse): Promise<T> {
  const body = await response.text();
  const data = body.startsWith("{")
    ? body
    : body
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice("data: ".length);
  if (!data) {
    throw new Error(`No JSON-RPC message in: ${body.slice(0, 200)}`);
  }
  return JSON.parse(data) as T;
}

export async function mcpPost(
  request: APIRequestContext,
  method: string,
  params: Record<string, unknown> = {},
  headers: Record<string, string> = {}
): Promise<APIResponse> {
  return await request.post("/api/mcp", {
    data: { id: nextId++, jsonrpc: "2.0", method, params },
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": MCP_PROTOCOL_VERSION,
      ...headers,
    },
  });
}

export async function mcpRequest<T>(
  request: APIRequestContext,
  method: string,
  params: Record<string, unknown> = {},
  headers: Record<string, string> = {}
): Promise<T> {
  const response = await mcpPost(request, method, params, headers);
  if (!response.ok()) {
    throw new Error(`${method} answered ${response.status()}`);
  }
  const message = await readMessage<JsonRpcResponse<T>>(response);
  if (message.error || !message.result) {
    throw new Error(`${method} failed: ${message.error?.message}`);
  }
  return message.result;
}

export async function callTool(
  request: APIRequestContext,
  name: string,
  args: Record<string, unknown> = {},
  headers: Record<string, string> = {}
): Promise<McpToolResult> {
  return await mcpRequest<McpToolResult>(
    request,
    "tools/call",
    { arguments: args, name },
    headers
  );
}
