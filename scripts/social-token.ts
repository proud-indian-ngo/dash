/**
 * Manage bearer tokens for the social API (`/api/social/v1/*`).
 *
 * Usage:
 *   bun run social:token create <name> --scopes events:read,photos:read,signups:read,social:write
 *   bun run social:token list
 *   bun run social:token revoke <id>
 *
 * `create` prints the raw token once; only its sha256 is stored.
 */
import { createHash, randomBytes } from "node:crypto";

import {
  createSocialApiToken,
  listSocialApiTokens,
  revokeSocialApiToken,
} from "@pi-dash/db/queries/social-api-token";
import {
  type SocialApiScope,
  socialApiScopeValues,
} from "@pi-dash/db/schema/social-api-token";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const USAGE = `Usage:
  bun run social:token create <name> --scopes ${socialApiScopeValues.join(",")}
  bun run social:token list
  bun run social:token revoke <id>
`;

function fail(message: string): never {
  process.stderr.write(`${message}\n\n${USAGE}`);
  process.exit(1);
}

function parseScopes(raw: string | undefined): SocialApiScope[] {
  const scopes = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (scopes.length === 0) {
    fail("--scopes is required");
  }
  const unknown = scopes.filter(
    (s) => !(socialApiScopeValues as readonly string[]).includes(s)
  );
  if (unknown.length > 0) {
    fail(`Unknown scope(s): ${unknown.join(", ")}`);
  }
  return [...new Set(scopes)] as SocialApiScope[];
}

async function create(args: string[]): Promise<void> {
  const scopesIndex = args.indexOf("--scopes");
  const scopesArg =
    scopesIndex === -1
      ? args.find((a) => a.startsWith("--scopes="))?.slice("--scopes=".length)
      : args[scopesIndex + 1];
  const name = args
    .filter(
      (a, i) =>
        !a.startsWith("--scopes") &&
        (scopesIndex === -1 || i !== scopesIndex + 1)
    )
    .join(" ")
    .trim();
  if (!name) {
    fail("A token name is required");
  }
  const scopes = parseScopes(scopesArg);
  const raw = randomBytes(32).toString("base64url");
  const id = await createSocialApiToken({
    name,
    scopes,
    tokenHash: createHash("sha256").update(raw).digest("hex"),
  });
  process.stdout.write(
    `Created social API token ${id} (${name}) with scopes ${scopes.join(", ")}.\nStore it now; it is not shown again:\n\n${raw}\n`
  );
}

async function list(): Promise<void> {
  const tokens = await listSocialApiTokens();
  if (tokens.length === 0) {
    process.stdout.write("No social API tokens.\n");
    return;
  }
  for (const t of tokens) {
    const state = t.revokedAt
      ? `revoked ${t.revokedAt.toISOString()}`
      : "active";
    const lastUsed = t.lastUsedAt ? t.lastUsedAt.toISOString() : "never";
    process.stdout.write(
      `${t.id}  ${t.name}  [${t.scopes.join(",")}]  ${state}  last used ${lastUsed}\n`
    );
  }
}

async function revoke(id: string | undefined): Promise<void> {
  if (!(id && UUID_RE.test(id))) {
    fail("A token id (uuid) is required");
  }
  const revoked = await revokeSocialApiToken(id);
  process.stdout.write(
    revoked ? `Revoked ${id}.\n` : `No active token with id ${id}.\n`
  );
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "create") {
    await create(args);
  } else if (command === "list") {
    await list();
  } else if (command === "revoke") {
    await revoke(args[0]);
  } else {
    fail(command ? `Unknown command: ${command}` : "A command is required");
  }
  process.exit(0);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `social:token failed: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
});
