# Assistants (MCP)

> **Load when**: `/api/mcp`, MCP tools, ChatGPT or Claude connectors, `apps/web/src/lib/server/mcp/`.
> **Related**: `recurring-events.md#public-feed`, `caching.md#rate-limiter`, `auth.md`

ChatGPT, Claude and other assistants connect to the dashboard's MCP server at `/api/mcp`, so a person chatting with one can ask about Proud Indian, see upcoming sessions, sign up for one or (once they connect their account) ask to join one, and get the donation link without leaving the chat.

## Transport

- `createMcpHandler` from `@modelcontextprotocol/server` (SDK v2) builds a fresh server per request; nothing is kept between requests.
- It keeps the SDK's default `legacy: "stateless"`, which also serves 2025-era clients. ChatGPT and Claude document only the 2025 protocol, so `legacy: "reject"` would cut them off.
- Assistants call from their providers' servers and send no `Origin`. A request with an `Origin` other than the dashboard's own is refused, which keeps other websites from calling it from a visitor's browser.
- The rate limit is per IP like the public feed's, but higher: one provider IP carries every person using that assistant.

## Tools

Every tool sets `readOnlyHint`, `destructiveHint` and `openWorldHint` explicitly; both vendors' directories require them. Only `start_volunteer_signup` and `show_interest` write. Each tool's `_meta.securitySchemes` says whether it needs a connected account; ChatGPT reads it.

| Tool | Answers from |
|---|---|
| `about_proud_indian` | The website's `llms.txt`, cached for an hour. Offline, it returns the website's address as an error result |
| `list_upcoming_sessions` | The [public feed](recurring-events.md#public-feed) query, with the same validation and limits. Its `signUpUrl`s are the website's |
| `get_donation_link` | `DONATE_URL` in `@pi-dash/shared/website`, which the website redirects to Razorpay |
| `start_volunteer_signup` | [Sign-up by an assistant](#sign-up-by-an-assistant) |
| `show_interest`, `my_interests` | The connected volunteer's account ([connected accounts](#connected-accounts)) |

The organisation's facts live on the website, not here: `about_proud_indian` passes the website's own summary through, so the answers change when the website does.

## Sign-up by an assistant

`start_volunteer_signup` (`lib/server/mcp/sign-up.ts`) takes the person's details and one session, and ends where a website sign-up link does: a verification email whose link files the interest ([link parameters](auth.md#link-parameters)).

- It creates the account with Better Auth's admin `createUser` and **no password**, then sends the verification email. A password typed into a chat would pass through the assistant's provider.
- Opening the link signs the account in (`autoSignInAfterVerification`), files the interest, and sends a passwordless account to `/set-password` before the session. Having no password is what marks an assistant's sign-up; nothing else is stored.
- Anyone can type someone else's email or phone into a chat, so the welcome and the WhatsApp orientation that a form sign-up starts at once wait for verification (`@pi-dash/auth/assistant-sign-up`).
- The answer is the same whether or not the email already has an account, so the tool can't reveal who volunteers. An unverified account gets the verification email again; a verified one gets nothing, and the answer gives the session's sign-up link for signing in.
- The session is checked before any account is made, with the website sign-up's rules (`register-interest.ts`): public, not Kalakriti, not cancelled or started, and a date for a series.
- Limits: 3 a day per email and per phone, and 60 an hour in all. The per-IP limit can't tell people apart here.
- Like any unauthenticated sign-up, it stays outside the audit ledger. Setting the first password (`account.password.set`) is audited.

## Connected accounts

A volunteer who already has an account connects it to the assistant over OAuth 2.1, and the account tools then act as them.

- `@better-auth/mcp` makes Better Auth the authorization server, with `jwt()` signing the access tokens. Its tables (`jwks`, `oauth_*`) live in the `private` schema: they hold token and client-secret hashes and the signing key.
- ChatGPT and Claude register themselves through dynamic client registration (`/api/auth/oauth2/register`), which is open. CIMD isn't enabled: on Bun it needs an SSRF-safe fetcher of our own, and both clients fall back to DCR. Nobody can create or edit a client from a session (`clientPrivileges`).
- Discovery: `routes/[.]well-known/$.ts` hands `/.well-known/oauth-protected-resource[/api/mcp]` and the authorization-server metadata to `auth.handler`, which answers them by path. The issuer is `<BETTER_AUTH_URL>/api/auth`, so clients read `/.well-known/oauth-authorization-server/api/auth`.
- Connecting runs through `/login` (the OAuth client plugin carries the signed query, and the login form leaves the redirect to it) and `/oauth/consent`. The consent page renders in the browser only: the signature covers the raw query, which the router's parsed search doesn't keep. Consenting is audited as `account.oauth.consent`.
- `/api/mcp` answers a call to an account tool, or any request with a token, through `requireMcpAuth`: signature against the JWKS, issuer, audience `MCP_RESOURCE` and expiry. Without a valid token it returns HTTP 401 with the RFC 9728 challenge before the MCP SDK runs, which is what makes Claude and ChatGPT ask the person to connect. It fetches the JWKS from `<BETTER_AUTH_URL>/api/auth/jwks`, so the server must reach its own public URL.
- `show_interest` runs the app's own `eventInterest.create` mutator through `runServerZeroMutation`, so it has the app's rules (team members, the safeguarding gate, started sessions) and audit row. Both tools reload the account and refuse a banned or deleted one before its token expires.
- Access tokens last an hour and refresh tokens 30 days; the consent page says so. There is no dashboard page yet to list or revoke connections.
- The OAuth tables hold runtime auth records like sessions, so they have no seed rows.
