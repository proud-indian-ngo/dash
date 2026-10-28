import {
  McpServer,
  type McpRequestContext,
} from "@modelcontextprotocol/server";
import { MCP_RESOURCE } from "@pi-dash/auth";
import {
  getPublicCostCentres,
  getPublicEvents,
} from "@pi-dash/db/queries/public-events";
import { env } from "@pi-dash/env/server";
import {
  PUBLIC_EVENTS_MAX_DAYS,
  PUBLIC_EVENTS_MAX_LIMIT,
  parsePublicEventsQuery,
  PublicEventsQueryError,
} from "@pi-dash/shared/public-events";
import { DONATE_URL, WEBSITE_URL } from "@pi-dash/shared/website";
import z from "zod";

import { listMyInterests, showInterest } from "@/lib/server/mcp/account-tools";
import { startAssistantSignUp } from "@/lib/server/mcp/sign-up";
import { createTtlCache } from "@/lib/ttl-cache";

/**
 * The MCP server ChatGPT, Claude and other assistants connect to at
 * `/api/mcp`. One instance per request (the transport is stateless).
 */

const INSTRUCTIONS = `Proud Indian is a volunteer-run NGO in Bengaluru (Bangalore), India. Its volunteers teach children maths, Spoken English and art at weekends. These tools answer questions about Proud Indian, list its upcoming volunteering sessions, sign a new volunteer up for one, show interest in one for a volunteer who has connected their Proud Indian account, and give the link to the donation page. Everything else about Proud Indian is on ${WEBSITE_URL}.`;

const ABOUT_URL = `${WEBSITE_URL}/llms.txt`;
const ABOUT_TIMEOUT_MS = 5000;
const aboutCache = createTtlCache<string>({
  maxEntries: 1,
  ttlMs: 60 * 60_000,
});

/** The website's own summary for assistants, cached for an hour. */
async function aboutText(now: number): Promise<string> {
  const cached = aboutCache.get("about", now);
  if (cached) {
    return cached;
  }
  const response = await fetch(ABOUT_URL, {
    signal: AbortSignal.timeout(ABOUT_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${ABOUT_URL} answered ${response.status}`);
  }
  const text = await response.text();
  aboutCache.set("about", text, now);
  return text;
}

const text = (value: string) => ({
  content: [{ text: value, type: "text" as const }],
});

/** Tools that act as the volunteer who connected their account. */
export const ACCOUNT_TOOLS = new Set(["my_interests", "show_interest"]);

// ChatGPT reads each tool's auth from `securitySchemes`.
const NO_AUTH = { securitySchemes: [{ type: "noauth" }] };
const ACCOUNT_AUTH = { securitySchemes: [{ scopes: [], type: "oauth2" }] };

const resourceUrl = new URL(MCP_RESOURCE);
const RESOURCE_METADATA_URL = `${resourceUrl.origin}/.well-known/oauth-protected-resource${resourceUrl.pathname}`;

/**
 * An account tool's answer without a connected account; only ChatGPT gets
 * here, as the route answers other clients with an HTTP 401. ChatGPT offers
 * to connect only on this in-band challenge, which needs both `error` and
 * `error_description`.
 */
const NOT_CONNECTED = {
  _meta: {
    "mcp/www_authenticate": [
      `Bearer resource_metadata="${RESOURCE_METADATA_URL}", error="invalid_token", error_description="Connect your Proud Indian account to continue."`,
    ],
  },
  ...text("Connect the person's Proud Indian account first."),
  isError: true,
};

export function createMcpServer({ authInfo }: McpRequestContext): McpServer {
  // Set by the route from a verified access token's subject.
  const userId =
    typeof authInfo?.extra?.userId === "string" ? authInfo.extra.userId : null;
  const server = new McpServer(
    { name: "proud-indian", title: "Proud Indian", version: "1.0.0" },
    { instructions: INSTRUCTIONS }
  );

  server.registerTool(
    "about_proud_indian",
    {
      _meta: NO_AUTH,
      annotations: {
        title: "About Proud Indian",
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "Everything about Proud Indian in Markdown, from its website: what it does, its programmes (teaching, meals, Kalakriti), how to volunteer, the volunteering FAQ, donations and 80G tax receipts, CSR, registrations and annual reports.",
      title: "About Proud Indian",
    },
    async () => {
      try {
        return text(await aboutText(Date.now()));
      } catch {
        return {
          ...text(
            `Proud Indian's summary couldn't be loaded. Its website is ${WEBSITE_URL}.`
          ),
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "list_upcoming_sessions",
    {
      _meta: NO_AUTH,
      annotations: {
        title: "List upcoming volunteering sessions",
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "Proud Indian's upcoming public volunteering sessions, soonest first. Each has its date and time, area, team, a short summary and a signUpUrl: the page where a person registers (or signs in) and shows interest in that session. Times are ISO 8601 in UTC; the sessions take place in India Standard Time (UTC+05:30).",
      inputSchema: z.object({
        city: z
          .string()
          .optional()
          .describe(
            "City code, such as BLR for Bengaluru. Leave out for every city."
          ),
        days: z
          .number()
          .int()
          .min(1)
          .max(PUBLIC_EVENTS_MAX_DAYS)
          .optional()
          .describe("How many days ahead to look. Defaults to 30."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(PUBLIC_EVENTS_MAX_LIMIT)
          .optional()
          .describe("The most sessions to return. Defaults to 20."),
      }),
      title: "List upcoming volunteering sessions",
    },
    async ({ city, days, limit }) => {
      const params = new URLSearchParams();
      if (city) {
        params.set("city", city);
      }
      if (days) {
        params.set("days", String(days));
      }
      if (limit) {
        params.set("limit", String(limit));
      }
      const codes = (await getPublicCostCentres()).map((c) => c.code);
      try {
        const query = parsePublicEventsQuery(params, Date.now(), codes);
        const events = await getPublicEvents(query, env.BETTER_AUTH_URL);
        return text(JSON.stringify({ events }));
      } catch (error) {
        if (error instanceof PublicEventsQueryError) {
          return { ...text(error.message), isError: true };
        }
        throw error;
      }
    }
  );

  server.registerTool(
    "get_donation_link",
    {
      _meta: NO_AUTH,
      annotations: {
        title: "Get the donation link",
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "The link to the donate section of Proud Indian's website, which explains what a gift funds and the 80G tax receipt. From there the person chooses an amount and pays on Razorpay themselves; the tool takes no payment.",
      title: "Get the donation link",
    },
    () => text(DONATE_URL)
  );

  server.registerTool(
    "start_volunteer_signup",
    {
      _meta: NO_AUTH,
      annotations: {
        title: "Sign up a volunteer for a session",
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description:
        "Signs a person up as a Proud Indian volunteer, with the details they give, and asks to join one session. Volunteers must be 18 or older. Proud Indian emails the address a link to confirm it; opening the link signs them in, asks them to set a password and sends their interest to the session's team lead, who approves it. Nothing is final until the link is opened.",
      inputSchema: z.object({
        email: z.email(),
        eventId: z
          .uuid()
          .describe("The session's id from list_upcoming_sessions."),
        isAdult: z
          .boolean()
          .describe("The person's confirmation that they are 18 or older."),
        name: z.string().trim().min(2).max(100).describe("Full name"),
        occDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe(
            "The session's occurrenceDate from list_upcoming_sessions; required for a recurring session."
          ),
        phone: z
          .string()
          .describe(
            "Mobile number with country code, such as +91 98765 43210. Indian numbers may leave the code out."
          ),
      }),
      title: "Sign up a volunteer for a session",
    },
    async (input) => {
      const result = await startAssistantSignUp(input);
      return { ...text(result.message), isError: result.isError };
    }
  );

  server.registerTool(
    "show_interest",
    {
      _meta: ACCOUNT_AUTH,
      annotations: {
        title: "Show interest in a session",
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Asks to join one session as the volunteer whose Proud Indian account is connected. The session's team lead approves or declines the request. People without an account sign up with start_volunteer_signup.",
      inputSchema: z.object({
        eventId: z
          .uuid()
          .describe("The session's id from list_upcoming_sessions."),
        occDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe(
            "The session's occurrenceDate from list_upcoming_sessions; required for a recurring session."
          ),
      }),
      title: "Show interest in a session",
    },
    async (input) => {
      if (!userId) {
        return NOT_CONNECTED;
      }
      const result = await showInterest(userId, input);
      return { ...text(result.message), isError: result.isError };
    }
  );

  server.registerTool(
    "my_interests",
    {
      _meta: ACCOUNT_AUTH,
      annotations: {
        title: "List my session requests",
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "The connected volunteer's requests to join upcoming sessions, with each one's status: pending (waiting for the team lead), approved, rejected or expired.",
      title: "List my session requests",
    },
    async () => {
      if (!userId) {
        return NOT_CONNECTED;
      }
      const result = await listMyInterests(userId);
      return { ...text(result.message), isError: result.isError };
    }
  );

  return server;
}
