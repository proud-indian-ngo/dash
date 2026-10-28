import { env } from "@pi-dash/env/server";
import { DONATE_URL, WEBSITE_URL } from "@pi-dash/shared/website";
import { createFileRoute } from "@tanstack/react-router";

/**
 * How an agent signs a person up, for agents that look for `/auth.md`
 * (assistants.md). Proud Indian has no agent registration API of its own:
 * this points at the MCP server and, without one, at the sign-up page.
 */
function authMd(): string {
  const base = env.BETTER_AUTH_URL;
  return `# Signing up for Proud Indian

You are an agent helping a person volunteer with Proud Indian, a volunteer-run NGO in Bengaluru, India. Volunteers must be 18 or older. Never guess or reuse anyone's details: ask the person for each one.

## With MCP

Proud Indian's MCP server is \`${base}/api/mcp\` (Streamable HTTP). These tools need no sign-in:

- \`list_upcoming_sessions\`: public sessions. Confirm one with the person.
- \`start_volunteer_signup\`: name, email, mobile number, the person's confirmation that they are 18 or older, and the session. Proud Indian emails the person a link; opening it finishes the sign-up.

A team lead approves the person's place in the session.

For someone who already has an account, connect it: \`show_interest\` and \`my_interests\` answer 401 with a \`WWW-Authenticate\` header whose \`resource_metadata\` starts the sign-in. It is OAuth 2.1 with PKCE and dynamic client registration; the person signs in and approves on Proud Indian's pages.

## Without MCP

Give the person a session's sign-up link. Each session in \`${base}/api/public/events\` (OpenAPI: \`${base}/api/public/openapi.json\`) has a \`signUpUrl\`; the person fills in the form there and confirms their email.

## Donating

Send the person to ${DONATE_URL}. They choose the amount and pay themselves. More about Proud Indian is at ${WEBSITE_URL}/llms.txt.
`;
}

const respond = () =>
  new Response(authMd(), {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });

export const Route = createFileRoute("/auth.md")({
  server: {
    handlers: {
      GET: respond,
      HEAD: respond,
    },
  },
});
