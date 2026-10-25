# Assistants (MCP)

> **Load when**: `/api/mcp`, MCP tools, ChatGPT or Claude connectors, `apps/web/src/lib/server/mcp/`.
> **Related**: `recurring-events.md#public-feed`, `caching.md#rate-limiter`, `auth.md`

ChatGPT, Claude and other assistants connect to the dashboard's MCP server at `/api/mcp`, so a person chatting with one can ask about Proud Indian, see upcoming sessions and get the donation link without leaving the chat.

## Transport

- `createMcpHandler` from `@modelcontextprotocol/server` (SDK v2) builds a fresh server per request; nothing is kept between requests.
- It keeps the SDK's default `legacy: "stateless"`, which also serves 2025-era clients. ChatGPT and Claude document only the 2025 protocol, so `legacy: "reject"` would cut them off.
- Assistants call from their providers' servers and send no `Origin`. A request with an `Origin` other than the dashboard's own is refused, which keeps other websites from calling it from a visitor's browser.
- The rate limit is per IP like the public feed's, but higher: one provider IP carries every person using that assistant.

## Tools

Every tool sets `readOnlyHint`, `destructiveHint` and `openWorldHint` explicitly; both vendors' directories require them.

| Tool | Answers from |
|---|---|
| `about_proud_indian` | The website's `llms.txt`, cached for an hour. Offline, it returns the website's address as an error result |
| `list_upcoming_sessions` | The [public feed](recurring-events.md#public-feed) query, with the same validation and limits. Its `signUpUrl`s are the website's |
| `get_donation_link` | `DONATE_URL` in `@pi-dash/shared/website`, which the website redirects to Razorpay |

The organisation's facts live on the website, not here: `about_proud_indian` passes the website's own summary through, so the answers change when the website does.
