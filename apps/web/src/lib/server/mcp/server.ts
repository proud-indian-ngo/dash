import {
  McpServer,
  type McpRequestContext,
} from "@modelcontextprotocol/server";
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
import {
  confirmAssistantSignUp,
  startAssistantSignUp,
} from "@/lib/server/mcp/sign-up";
import { createTtlCache } from "@/lib/ttl-cache";

/**
 * The MCP server ChatGPT, Claude and other assistants connect to at
 * `/api/mcp`. One instance per request (the transport is stateless).
 */

const INSTRUCTIONS = `Proud Indian is a volunteer-run NGO in Bengaluru (Bangalore), India. Its volunteers teach children maths, Spoken English and art at weekends. Use these tools to answer questions about Proud Indian, list its upcoming volunteering sessions, sign a new volunteer up for one, show interest in one for a volunteer who has connected their Proud Indian account, and send people who want to donate to the donation page. Never invent sessions, links or facts; anything not covered here is on ${WEBSITE_URL}.`;

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

/**
 * Tools that act as the volunteer who connected their account. The route
 * answers a call to one without a valid access token with an HTTP 401, so
 * the assistant asks the person to connect first.
 */
export const ACCOUNT_TOOLS = new Set(["my_interests", "show_interest"]);

// ChatGPT reads each tool's auth from `securitySchemes`.
const NO_AUTH = { securitySchemes: [{ type: "noauth" }] };
const ACCOUNT_AUTH = { securitySchemes: [{ scopes: [], type: "oauth2" }] };

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
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "Everything about Proud Indian in Markdown, from its website: what it does, its programmes (teaching, meals, Kalakriti), how to volunteer, the volunteering FAQ, donations and 80G tax receipts, CSR, registrations and annual reports. Use it to answer any question about Proud Indian.",
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
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "Proud Indian's upcoming public volunteering sessions, soonest first. Each has its date and time, area, team, a short summary and a signUpUrl: the page where a person registers (or signs in) and shows interest in that session. Use each signUpUrl exactly as given; never build one. Times are ISO 8601 in UTC; show them in India Standard Time.",
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
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "The link to donate to Proud Indian. It opens Proud Indian's Razorpay donation page, where the person chooses an amount and pays themselves; every donation gets an 80G tax receipt by email. Give the person this link whenever they want to donate.",
      title: "Get the donation link",
    },
    () => text(DONATE_URL)
  );

  server.registerTool(
    "start_volunteer_signup",
    {
      _meta: NO_AUTH,
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Sign a person up as a Proud Indian volunteer and ask to join one session. Ask the person for every field and confirm the session with them first; never guess or reuse someone else's details. Volunteers must be 18 or older. Proud Indian emails them a link and a 6-digit code to confirm their address; opening the link signs them in, asks them to set a password and sends their interest to the session's team lead, who approves it. Nothing is final until they open the link or give you the code for confirm_volunteer_signup, so tell them to check their inbox.",
      inputSchema: z.object({
        dateOfBirth: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe("YYYY-MM-DD"),
        email: z.email(),
        eventId: z
          .uuid()
          .describe("The session's id from list_upcoming_sessions."),
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
    "confirm_volunteer_signup",
    {
      _meta: NO_AUTH,
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Finish a sign-up started with start_volunteer_signup, using the 6-digit code from the email Proud Indian sent. Only use a code the person gives you. It confirms their address, sends their interest to the session's team lead and emails them a link to set a password.",
      inputSchema: z.object({
        code: z
          .string()
          .regex(/^\s*\d{6}\s*$/)
          .describe("The 6-digit code from the email"),
        email: z.email(),
        eventId: z.uuid().describe("The same session as the sign-up."),
        occDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("The same occDate as the sign-up, if it had one."),
      }),
      title: "Confirm a volunteer's sign-up",
    },
    async (input) => {
      const result = await confirmAssistantSignUp(input);
      return { ...text(result.message), isError: result.isError };
    }
  );

  const notConnected = {
    ...text("Connect the person's Proud Indian account first."),
    isError: true,
  };

  server.registerTool(
    "show_interest",
    {
      _meta: ACCOUNT_AUTH,
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Ask to join one session as the volunteer whose Proud Indian account is connected. Confirm the session with them first. The session's team lead approves or declines it. For someone without an account, use start_volunteer_signup instead.",
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
        return notConnected;
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
        return notConnected;
      }
      const result = await listMyInterests(userId);
      return { ...text(result.message), isError: result.isError };
    }
  );

  return server;
}
