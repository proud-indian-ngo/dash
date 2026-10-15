/**
 * Submit and check the WhatsApp Cloud API message templates in
 * `packages/whatsapp/src/templates.ts`.
 *
 * Usage:
 *   bun run whatsapp:templates status
 *   bun run whatsapp:templates submit [--dry-run] [name ...]
 *
 * `status` lists each template's review status on Meta and flags any Meta
 * moved to another category or rejected. `submit` creates the templates
 * that don't exist on Meta yet (or only the names given); existing ones are
 * left alone, so it's safe to run again after adding a template.
 *
 * Needs WHATSAPP_CLOUD_ACCESS_TOKEN (the system user's token),
 * WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID and APP_URL. APP_URL must be the
 * production URL: the dashboard button's link is fixed at approval, so run
 * it as `APP_URL=https://dash.proudindian.ngo bun run whatsapp:templates …`
 * if your .env points at localhost.
 */
import {
  toTemplatePayload,
  WHATSAPP_TEMPLATES,
  type WhatsAppTemplate,
} from "@pi-dash/whatsapp/templates";

const GRAPH_URL = "https://graph.facebook.com";
const DEFAULT_GRAPH_VERSION = "v25.0";

const USAGE = `Usage:
  bun run whatsapp:templates status
  bun run whatsapp:templates submit [--dry-run] [name ...]
`;

interface RemoteTemplate {
  category: string;
  id: string;
  language: string;
  name: string;
  rejected_reason?: string;
  status: string;
}

interface GraphError {
  error?: {
    error_user_msg?: string;
    error_user_title?: string;
    message?: string;
  };
}

function fail(message: string): never {
  process.stderr.write(`${message}\n\n${USAGE}`);
  process.exit(1);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    fail(`${name} is not set`);
  }
  return value;
}

function config() {
  const appUrl = requireEnv("APP_URL");
  // The dashboard button's link is fixed when Meta approves the template.
  if (!appUrl.startsWith("https://") || appUrl.includes("localhost")) {
    fail(`APP_URL must be the production https URL, got ${appUrl}`);
  }
  return {
    accessToken: requireEnv("WHATSAPP_CLOUD_ACCESS_TOKEN"),
    appUrl,
    businessAccountId: requireEnv("WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID"),
    graphVersion:
      process.env.WHATSAPP_CLOUD_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION,
  };
}

type Config = ReturnType<typeof config>;

function graphErrorMessage(body: GraphError, status: number): string {
  const error = body.error;
  return (
    [error?.error_user_title, error?.error_user_msg ?? error?.message]
      .filter(Boolean)
      .join(": ") || `HTTP ${status}`
  );
}

async function graph<T>(
  cfg: Config,
  path: string,
  init?: { body: unknown; method: "POST" }
): Promise<T> {
  const response = await fetch(`${GRAPH_URL}/${cfg.graphVersion}/${path}`, {
    body: init ? JSON.stringify(init.body) : undefined,
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      "Content-Type": "application/json",
    },
    method: init?.method ?? "GET",
  });
  const body = (await response.json()) as T & GraphError;
  if (!response.ok) {
    throw new Error(graphErrorMessage(body, response.status));
  }
  return body;
}

async function listRemote(cfg: Config): Promise<RemoteTemplate[]> {
  const templates: RemoteTemplate[] = [];
  let path: string | undefined =
    `${cfg.businessAccountId}/message_templates?fields=id,name,language,status,category,rejected_reason&limit=100`;
  while (path) {
    const page: { data: RemoteTemplate[]; paging?: { next?: string } } =
      await graph(cfg, path);
    templates.push(...page.data);
    const next = page.paging?.next;
    path = next ? next.slice(next.indexOf(cfg.businessAccountId)) : undefined;
  }
  return templates;
}

function remoteKey(name: string, language: string): string {
  return `${name}:${language}`;
}

async function status(): Promise<void> {
  const cfg = config();
  const remote = new Map(
    (await listRemote(cfg)).map((t) => [remoteKey(t.name, t.language), t])
  );
  const counts = new Map<string, number>();
  for (const template of WHATSAPP_TEMPLATES) {
    const payload = toTemplatePayload(template, cfg.appUrl);
    const found = remote.get(remoteKey(template.name, payload.language));
    const state = found?.status ?? "NOT SUBMITTED";
    counts.set(state, (counts.get(state) ?? 0) + 1);
    const notes = [
      found && found.category !== template.category
        ? `moved to ${found.category}`
        : "",
      found?.rejected_reason && found.rejected_reason !== "NONE"
        ? `reason: ${found.rejected_reason}`
        : "",
    ].filter(Boolean);
    process.stdout.write(
      `${state.padEnd(14)} ${template.name}${notes.length > 0 ? `  (${notes.join("; ")})` : ""}\n`
    );
  }
  const summary = [...counts.entries()]
    .map(([state, count]) => `${count} ${state.toLowerCase()}`)
    .join(", ");
  process.stdout.write(`\n${summary}\n`);
}

async function submit(args: string[]): Promise<void> {
  const dryRun = args.includes("--dry-run");
  const names = args.filter((arg) => !arg.startsWith("--"));
  const unknown = names.filter(
    (name) => !WHATSAPP_TEMPLATES.some((t) => t.name === name)
  );
  if (unknown.length > 0) {
    fail(`Unknown template(s): ${unknown.join(", ")}`);
  }
  const selected: readonly WhatsAppTemplate[] =
    names.length > 0
      ? WHATSAPP_TEMPLATES.filter((t) => names.includes(t.name))
      : WHATSAPP_TEMPLATES;

  const cfg = config();
  const existing = new Set(
    (await listRemote(cfg)).map((t) => remoteKey(t.name, t.language))
  );

  let created = 0;
  let failed = 0;
  let skipped = 0;
  for (const template of selected) {
    const payload = toTemplatePayload(template, cfg.appUrl);
    if (existing.has(remoteKey(payload.name, payload.language))) {
      skipped += 1;
      process.stdout.write(`exists   ${template.name}\n`);
      continue;
    }
    if (dryRun) {
      process.stdout.write(
        `would create ${template.name}\n${JSON.stringify(payload, null, 2)}\n`
      );
      continue;
    }
    try {
      const result = await graph<{ category: string; status: string }>(
        cfg,
        `${cfg.businessAccountId}/message_templates`,
        { body: payload, method: "POST" }
      );
      created += 1;
      const moved =
        result.category && result.category !== template.category
          ? ` (moved to ${result.category})`
          : "";
      process.stdout.write(
        `created  ${template.name}: ${result.status}${moved}\n`
      );
    } catch (error) {
      failed += 1;
      process.stdout.write(
        `FAILED   ${template.name}: ${error instanceof Error ? error.message : String(error)}\n`
      );
    }
  }
  process.stdout.write(
    `\n${created} created, ${skipped} already on Meta, ${failed} failed\n`
  );
  if (failed > 0) {
    process.exit(1);
  }
}

const [command, ...rest] = process.argv.slice(2);
try {
  switch (command) {
    case "status":
      await status();
      break;
    case "submit":
      await submit(rest);
      break;
    default:
      fail(command ? `Unknown command: ${command}` : "Missing command");
  }
} catch (error) {
  process.stderr.write(
    `Meta API error: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
}
