/**
 * Submit, edit and check the WhatsApp Cloud API message templates in
 * `packages/whatsapp/src/templates.ts`.
 *
 * Usage:
 *   bun run whatsapp:templates status
 *   bun run whatsapp:templates submit [--dry-run] [name ...]
 *   bun run whatsapp:templates edit [--dry-run] [--limit N] [--continue] [name ...]
 *
 * `status` lists each template's review status on Meta and flags any Meta
 * moved to another category or rejected. `submit` creates the templates
 * that don't exist on Meta yet (or only the names given); existing ones are
 * left alone, so it's safe to run again after adding a template.
 *
 * `edit` replaces the components (header, body, footer, buttons) of
 * templates on Meta whose text differs from ours, keeping their names, via
 * `POST /{template-id}`. Unchanged templates are skipped, so it's safe to
 * run again. Meta edits only APPROVED, REJECTED or PAUSED templates, never
 * an approved template's category, and an approved one at most once a day
 * and 10 times in 30 days; it re-approves the edit unless review fails it.
 * `--limit N` edits at most N (a canary: edit one, check `status`, then the
 * rest); it stops at the first failure unless `--continue` is passed.
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
  bun run whatsapp:templates edit [--dry-run] [--limit N] [--continue] [name ...]
`;

/** The statuses Meta lets you edit a template in. */
const EDITABLE_STATUSES = new Set(["APPROVED", "PAUSED", "REJECTED"]);

interface Component {
  buttons?: { text: string; type: string; url?: string }[];
  format?: string;
  text?: string;
  type: string;
}

interface RemoteTemplate {
  category: string;
  components: Component[];
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
    `${cfg.businessAccountId}/message_templates?fields=id,name,language,status,category,rejected_reason,components&limit=100`;
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

function selectTemplates(names: string[]): readonly WhatsAppTemplate[] {
  const unknown = names.filter(
    (name) => !WHATSAPP_TEMPLATES.some((t) => t.name === name)
  );
  if (unknown.length > 0) {
    fail(`Unknown template(s): ${unknown.join(", ")}`);
  }
  return names.length > 0
    ? WHATSAPP_TEMPLATES.filter((t) => names.includes(t.name))
    : WHATSAPP_TEMPLATES;
}

async function submit(args: string[]): Promise<void> {
  const dryRun = args.includes("--dry-run");
  const selected = selectTemplates(args.filter((arg) => !arg.startsWith("--")));

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

/**
 * The text Meta shows for each component, for comparing remote templates
 * with ours. Examples are left out: Meta stores them in its own shape, and
 * a changed example alone isn't worth an edit.
 */
function comparable(components: readonly Component[]): string {
  return JSON.stringify(
    components.map((c) => ({
      buttons: c.buttons?.map((b) => [b.type, b.text, b.url ?? null]) ?? null,
      format: c.format ?? null,
      text: c.text ?? null,
      type: c.type,
    }))
  );
}

function parseLimit(args: string[]): number {
  const at = args.indexOf("--limit");
  if (at === -1) {
    return Number.POSITIVE_INFINITY;
  }
  const limit = Number(args[at + 1]);
  if (!Number.isInteger(limit) || limit < 1) {
    fail("--limit needs a whole number of templates, at least 1");
  }
  args.splice(at, 2);
  return limit;
}

async function edit(args: string[]): Promise<void> {
  const options = [...args];
  const limit = parseLimit(options);
  const dryRun = options.includes("--dry-run");
  const keepGoing = options.includes("--continue");
  const selected = selectTemplates(
    options.filter((arg) => !arg.startsWith("--"))
  );

  const cfg = config();
  const remote = new Map(
    (await listRemote(cfg)).map((t) => [remoteKey(t.name, t.language), t])
  );

  let edited = 0;
  let failed = 0;
  let unchanged = 0;
  let notEditable = 0;
  let waiting = 0;
  for (const template of selected) {
    const payload = toTemplatePayload(template, cfg.appUrl);
    const found = remote.get(remoteKey(payload.name, payload.language));
    if (!found) {
      notEditable += 1;
      process.stdout.write(`missing  ${template.name} (run submit)\n`);
      continue;
    }
    if (comparable(found.components) === comparable(payload.components)) {
      unchanged += 1;
      continue;
    }
    if (!EDITABLE_STATUSES.has(found.status)) {
      notEditable += 1;
      process.stdout.write(`skipped  ${template.name}: ${found.status}\n`);
      continue;
    }
    if (edited + failed >= limit) {
      waiting += 1;
      continue;
    }
    if (dryRun) {
      edited += 1;
      process.stdout.write(
        `would edit ${template.name} (${found.status}, id ${found.id})\n${JSON.stringify(payload.components, null, 2)}\n`
      );
      continue;
    }
    try {
      await graph<{ success: boolean }>(cfg, found.id, {
        // Meta rejects an edit without these (error subcode 2388039).
        // The category must stay the one Meta holds: an approved
        // template's category can't change.
        body: {
          category: found.category,
          components: payload.components,
          parameter_format: payload.parameter_format,
        },
        method: "POST",
      });
      edited += 1;
      process.stdout.write(`edited   ${template.name}\n`);
    } catch (error) {
      failed += 1;
      process.stdout.write(
        `FAILED   ${template.name}: ${error instanceof Error ? error.message : String(error)}\n`
      );
      if (!keepGoing) {
        break;
      }
    }
  }
  process.stdout.write(
    `\n${edited} ${dryRun ? "to edit" : "edited"}, ${unchanged} unchanged, ${notEditable} not editable, ${waiting} past the limit, ${failed} failed\n`
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
    case "edit":
      await edit(rest);
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
