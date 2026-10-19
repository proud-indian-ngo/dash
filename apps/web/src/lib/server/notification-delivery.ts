import type { db } from "@pi-dash/db";
import { notificationTopicPreference, user } from "@pi-dash/db/schema/auth";
import { notification } from "@pi-dash/db/schema/notification";
import { emailSuppression } from "@pi-dash/db/schema/private/email-suppression";
import {
  heldNotification,
  heldNotificationRecipient,
} from "@pi-dash/db/schema/private/held-notification";
import { whatsappMessage } from "@pi-dash/db/schema/private/whatsapp-message";
import { MAX_ATTEMPTS } from "@pi-dash/notifications/batching";
import { TOPIC_CATALOG } from "@pi-dash/notifications/topics";
import {
  renderWhatsAppPreview,
  type WhatsAppPreview,
} from "@pi-dash/whatsapp/preview";
import { WHATSAPP_TEMPLATES } from "@pi-dash/whatsapp/templates";
import { type SQL, sql } from "drizzle-orm";

import {
  DELIVERY_HISTORY_DAYS,
  DELIVERY_STATS_DAYS,
  type DeliveryRow,
  type DeliveryStats,
  type EmailDeliveryStatus,
  type HeldFacts,
  type InboxStatus,
  type WhatsAppDeliveryStatus,
  type WhatsAppLogFacts,
} from "@/lib/notification-delivery";

type Executor = Pick<typeof db, "execute">;

const EMAIL_TOPICS = sql`array[${sql.join(
  TOPIC_CATALOG.filter(
    (topic) => topic.channels?.includes("email") ?? true
  ).map((topic) => sql`${topic.id}`),
  sql`, `
)}]::text[]`;

const TEMPLATE_LABELS = new Map<string, string>(
  WHATSAPP_TEMPLATES.map((template) => [template.name, template.label])
);

/** Epoch milliseconds; timestamps are stored as UTC without a zone. */
function epoch(column: string): SQL {
  return sql.raw(`(extract(epoch from ${column}) * 1000)::bigint`);
}

function since(days: number): SQL {
  return sql`now() - make_interval(days => ${days}::int)`;
}

function all(conditions: SQL[]): SQL {
  return sql.join([sql`true`, ...conditions], sql` and `);
}

export interface DeliveryFilters {
  email?: EmailDeliveryStatus;
  inbox?: InboxStatus;
  /** One message's key, to open a linked row that isn't on the page. */
  key?: string;
  search?: string;
  topic?: string;
  userId?: string;
  whatsapp?: WhatsAppDeliveryStatus;
}

/**
 * One row per person per notification over the last `days`: inbox rows
 * (keys `${key}-inbox` or `${key}-inbox-${userId}`), batched sends whose
 * inbox copy was off, and Cloud API sends with neither. A send keyed
 * `${key}-whatsapp-${userId}` was a notification whose inbox was off; any
 * other key (group invites, Social digests) never had an inbox copy.
 * Summaries are not rows of their own. Recipient, topic and search filter
 * each branch, so each reads its own index.
 */
function deliveriesCte(days: number, filters: DeliveryFilters): SQL {
  const pattern = filters.search?.trim()
    ? `%${filters.search.trim()}%`
    : undefined;
  const nameMatches = (userId: SQL) =>
    sql`exists (select 1 from ${user} su where su.id = ${userId} and su.name ilike ${pattern})`;
  const matchingTemplates = pattern
    ? [...TEMPLATE_LABELS]
        .filter(([, label]) =>
          label
            .toLowerCase()
            .includes(filters.search?.trim().toLowerCase() ?? "")
        )
        .map(([name]) => sql`${name}`)
    : [];
  const byUser = (column: SQL) =>
    filters.userId ? [sql`${column} = ${filters.userId}`] : [];
  const byTopic = (column: SQL) =>
    filters.topic ? [sql`${column} = ${filters.topic}`] : [];
  return sql`
    inbox as (
      select n.user_id, n.created_at, n.title, n.topic_id, n.read, n.archived,
        case
          when right(n.idempotency_key, length(n.user_id) + 7) = '-inbox-' || n.user_id
            then left(n.idempotency_key, -(length(n.user_id) + 7))
          when right(n.idempotency_key, 6) = '-inbox'
            then left(n.idempotency_key, -6)
          else n.idempotency_key
        end as key
      from ${notification} n
      where ${all([
        sql`n.created_at >= ${since(days)}`,
        ...byUser(sql`n.user_id`),
        ...byTopic(sql`n.topic_id`),
        ...(pattern
          ? [sql`(n.title ilike ${pattern} or ${nameMatches(sql`n.user_id`)})`]
          : []),
      ])}
    ),
    held_only as (
      select r.held_key as key, r.user_id, min(r.created_at) as created_at,
        hn.title, hn.topic_id
      from ${heldNotificationRecipient} r
      join ${heldNotification} hn on hn.key = r.held_key
      where ${all([
        sql`r.created_at >= ${since(days)}`,
        ...byUser(sql`r.user_id`),
        ...byTopic(sql`r.topic_id`),
        ...(pattern
          ? [sql`(hn.title ilike ${pattern} or ${nameMatches(sql`r.user_id`)})`]
          : []),
        sql`not exists (
          select 1 from ${notification} n
          where n.idempotency_key in (r.held_key || '-inbox', r.held_key || '-inbox-' || r.user_id)
        )`,
      ])}
      group by r.held_key, r.user_id, hn.title, hn.topic_id
    ),
    whatsapp_only as (
      select w.idempotency_key, w.user_id, w.created_at, w.template, b.key as base_key
      from ${whatsappMessage} w
      cross join lateral (
        select case
          when right(w.idempotency_key, length(w.user_id) + 10) = '-whatsapp-' || w.user_id
            then left(w.idempotency_key, -(length(w.user_id) + 10))
        end as key
      ) b
      where ${all([
        sql`w.created_at >= ${since(days)}`,
        sql`w.idempotency_key not like 'digest-%'`,
        ...byUser(sql`w.user_id`),
        ...(filters.topic ? [sql`false`] : []),
        ...(pattern
          ? [
              matchingTemplates.length > 0
                ? sql`(w.template in (${sql.join(matchingTemplates, sql`, `)}) or ${nameMatches(sql`w.user_id`)})`
                : nameMatches(sql`w.user_id`),
            ]
          : []),
        sql`not exists (
          select 1 from ${notification} n
          where n.idempotency_key in (b.key || '-inbox', b.key || '-inbox-' || w.user_id)
        )`,
        sql`not exists (
          select 1 from ${heldNotificationRecipient} r
          where r.held_key = b.key and r.user_id = w.user_id
        )`,
      ])}
    ),
    deliveries as (
      select i.key, i.user_id, i.created_at, i.title, i.topic_id, i.read,
        i.archived, 'inbox' as kind, i.key || '-whatsapp-' || i.user_id as whatsapp_key
      from inbox i
      union all
      select h.key, h.user_id, h.created_at, h.title, h.topic_id, null, null,
        'inbox_off', h.key || '-whatsapp-' || h.user_id
      from held_only h
      union all
      select coalesce(w.base_key, w.idempotency_key), w.user_id, w.created_at,
        w.template, null, null, null,
        case when w.base_key is null then 'whatsapp' else 'inbox_off' end,
        w.idempotency_key
      from whatsapp_only w
    )`;
}

/**
 * The status rules, as SQL over a `deliveries` row `d` and its joins. A
 * batched row's outcome is recorded by the flush job: `sent_at` with no
 * `batch_id` is a kill-switch drop, `skipped_read` a message already read in
 * the inbox, and `attempts` at `MAX_ATTEMPTS` a give-up. Email has no
 * per-message log, so a send on its own is "not tracked". "Off" and "No
 * WhatsApp" read the recipient as they are now, and only where nothing was
 * sent.
 */
const INBOX_STATUS_SQL = sql`case
  when d.kind = 'inbox' then
    case when d.archived then 'archived' when d.read then 'read' else 'unread' end
  when d.kind = 'inbox_off' then 'off'
  else 'none'
end`;

const WHATSAPP_STATUS_SQL = sql`case
  when hw.held_key is not null and hw.sent_at is null then 'held'
  when hw.held_key is not null and hw.batch_id is null then 'not_sent'
  when hw.skipped_read then 'skipped_read'
  when w.status is not null then w.status::text
  when s.status is not null then 'summary'
  when hw.attempts >= ${MAX_ATTEMPTS} then 'gave_up'
  when u.phone is null then 'no_whatsapp'
  when p.whatsapp_enabled = false then 'off'
  else 'not_sent'
end`;

const EMAIL_STATUS_SQL = sql`case
  when he.held_key is not null then
    case
      when he.sent_at is null then 'held'
      when he.batch_id is null then 'not_sent'
      when he.skipped_read then 'skipped_read'
      when es.created_at <= he.sent_at then 'suppressed'
      when he.attempts >= ${MAX_ATTEMPTS} then 'gave_up'
      when eb.size > 1 then 'summary'
      else 'not_tracked'
    end
  when d.topic_id is null or not (d.topic_id = any(${EMAIL_TOPICS})) then 'none'
  when es.created_at <= d.created_at then 'suppressed'
  else 'not_tracked'
end`;

interface FactRow extends Record<string, unknown> {
  created_at: string;
  e_attempts: number | null;
  e_batch_id: string | null;
  e_batch_size: number | null;
  e_claimed_at: string | null;
  e_created_at: string | null;
  e_sent_at: string | null;
  email_status: EmailDeliveryStatus;
  inbox_status: InboxStatus;
  key: string;
  recipient_name: string | null;
  s_created_at: string | null;
  s_error: string | null;
  s_status: WhatsAppLogFacts["status"] | null;
  s_template: string | null;
  s_updated_at: string | null;
  suppressed_at: string | null;
  title: string;
  topic_id: string | null;
  total: number;
  user_id: string | null;
  w_attempts: number | null;
  w_batch_id: string | null;
  w_batch_size: number | null;
  w_claimed_at: string | null;
  w_created_at: string | null;
  w_error: string | null;
  w_sent_at: string | null;
  w_status: WhatsAppLogFacts["status"] | null;
  w_template: string | null;
  w_updated_at: string | null;
  whatsapp_status: WhatsAppDeliveryStatus;
  wl_created_at: string | null;
  wl_updated_at: string | null;
}

function num(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

function heldFacts(row: FactRow, prefix: "e" | "w"): HeldFacts | null {
  const createdAt = num(row[`${prefix}_created_at`] as string | null);
  if (createdAt === null) {
    return null;
  }
  return {
    attempts: Number(row[`${prefix}_attempts`]),
    batchId: row[`${prefix}_batch_id`] as string | null,
    batchSize: Number(row[`${prefix}_batch_size`] ?? 1),
    claimedAt: num(row[`${prefix}_claimed_at`] as string | null),
    createdAt,
    sentAt: num(row[`${prefix}_sent_at`] as string | null),
  };
}

function logFacts(
  status: WhatsAppLogFacts["status"] | null,
  fields: {
    createdAt: string | null;
    error: string | null;
    template: string | null;
    updatedAt: string | null;
  }
): WhatsAppLogFacts | null {
  if (status === null) {
    return null;
  }
  return {
    createdAt: Number(fields.createdAt),
    error: fields.error,
    status,
    template: fields.template ?? "",
    updatedAt: Number(fields.updatedAt),
  };
}

function toDeliveryRow(row: FactRow): DeliveryRow {
  return {
    createdAt: Number(row.created_at),
    email: row.email_status,
    emailHeld: heldFacts(row, "e"),
    id: `${row.key}\n${row.user_id ?? ""}`,
    inbox: row.inbox_status,
    key: row.key,
    recipientName: row.recipient_name,
    suppressedAt: num(row.suppressed_at),
    title:
      row.topic_id === null
        ? (TEMPLATE_LABELS.get(row.title) ?? row.title)
        : row.title,
    topicId: row.topic_id,
    userId: row.user_id,
    whatsapp: row.whatsapp_status,
    whatsappHeld: heldFacts(row, "w"),
    whatsappLog: logFacts(row.w_status, {
      createdAt: row.wl_created_at,
      error: row.w_error,
      template: row.w_template,
      updatedAt: row.wl_updated_at,
    }),
    whatsappSummaryLog: logFacts(row.s_status, {
      createdAt: row.s_created_at,
      error: row.s_error,
      template: row.s_template,
      updatedAt: row.s_updated_at,
    }),
  };
}

export interface DeliveryPage {
  rows: DeliveryRow[];
  total: number;
}

/** A page of deliveries, newest first, filtered and counted in Postgres. */
export async function queryDeliveries(
  executor: Executor,
  filters: DeliveryFilters & { limit: number; offset: number }
): Promise<DeliveryPage> {
  const outer = all([
    ...(filters.key ? [sql`r.key = ${filters.key}`] : []),
    ...(filters.inbox ? [sql`r.inbox_status = ${filters.inbox}`] : []),
    ...(filters.whatsapp ? [sql`r.whatsapp_status = ${filters.whatsapp}`] : []),
    ...(filters.email ? [sql`r.email_status = ${filters.email}`] : []),
  ]);
  const rows = await executor.execute(sql`
    with ${deliveriesCte(DELIVERY_HISTORY_DAYS, filters)},
    rows as (
      select d.key, d.user_id, d.created_at, d.title, d.topic_id,
        u.name as recipient_name,
        es.created_at as suppressed_at,
        he.created_at as e_created_at, he.claimed_at as e_claimed_at,
        he.sent_at as e_sent_at, he.attempts as e_attempts,
        he.batch_id as e_batch_id, eb.size as e_batch_size,
        hw.created_at as w_created_at, hw.claimed_at as w_claimed_at,
        hw.sent_at as w_sent_at, hw.attempts as w_attempts,
        hw.batch_id as w_batch_id, wb.size as w_batch_size,
        w.status as w_status, w.error as w_error, w.template as w_template,
        w.created_at as wl_created_at, w.updated_at as wl_updated_at,
        s.status as s_status, s.error as s_error, s.template as s_template,
        s.created_at as s_created_at, s.updated_at as s_updated_at,
        ${INBOX_STATUS_SQL} as inbox_status,
        ${WHATSAPP_STATUS_SQL} as whatsapp_status,
        ${EMAIL_STATUS_SQL} as email_status
      from deliveries d
      left join ${user} u on u.id = d.user_id
      left join ${emailSuppression} es on es.email = lower(u.email)
      left join ${notificationTopicPreference} p
        on p.user_id = d.user_id and p.topic_id = d.topic_id
      left join ${heldNotificationRecipient} he
        on he.held_key = d.key and he.user_id = d.user_id and he.channel = 'email'
      left join lateral (
        select count(*)::int as size from ${heldNotificationRecipient} b
        where b.batch_id = he.batch_id and not b.skipped_read
      ) eb on true
      left join ${heldNotificationRecipient} hw
        on hw.held_key = d.key and hw.user_id = d.user_id and hw.channel = 'whatsapp'
      left join lateral (
        select count(*)::int as size from ${heldNotificationRecipient} b
        where b.batch_id = hw.batch_id and not b.skipped_read
      ) wb on true
      left join ${whatsappMessage} w on w.idempotency_key = d.whatsapp_key
      left join ${whatsappMessage} s
        on s.idempotency_key = 'digest-' || hw.batch_id || '-whatsapp'
    )
    select r.key, r.user_id, ${epoch("r.created_at")} as created_at, r.title,
      r.topic_id, r.recipient_name, r.inbox_status, r.whatsapp_status,
      r.email_status,
      ${epoch("r.suppressed_at")} as suppressed_at,
      ${epoch("r.e_created_at")} as e_created_at,
      ${epoch("r.e_claimed_at")} as e_claimed_at,
      ${epoch("r.e_sent_at")} as e_sent_at,
      r.e_attempts, r.e_batch_id, r.e_batch_size,
      ${epoch("r.w_created_at")} as w_created_at,
      ${epoch("r.w_claimed_at")} as w_claimed_at,
      ${epoch("r.w_sent_at")} as w_sent_at,
      r.w_attempts, r.w_batch_id, r.w_batch_size,
      r.w_status, r.w_error, r.w_template,
      ${epoch("r.wl_created_at")} as wl_created_at,
      ${epoch("r.wl_updated_at")} as wl_updated_at,
      r.s_status, r.s_error, r.s_template,
      ${epoch("r.s_created_at")} as s_created_at,
      ${epoch("r.s_updated_at")} as s_updated_at,
      count(*) over ()::int as total
    from rows r
    where ${outer}
    order by r.created_at desc, r.key, r.user_id
    limit ${filters.limit} offset ${filters.offset}
  `);
  // The Bun SQL driver types raw rows loosely; the select list above is FactRow.
  const facts = [...rows] as FactRow[];
  return {
    rows: facts.map(toDeliveryRow),
    total: Number(facts[0]?.total ?? 0),
  };
}

export interface DeliveryOverview {
  recipients: { id: string; name: string }[];
  stats: DeliveryStats;
}

/** The last week's figures and everyone who received something in 90 days. */
export async function queryDeliveryOverview(
  executor: Executor
): Promise<DeliveryOverview> {
  const [statRows, recipients] = await Promise.all([
    executor.execute<Record<keyof DeliveryStats, number>>(sql`
      with ${deliveriesCte(DELIVERY_STATS_DAYS, {})}
      select
        (select count(*)::int from deliveries) as "notificationsSent",
        (select count(*)::int from ${whatsappMessage}
          where created_at >= ${since(DELIVERY_STATS_DAYS)}
            and status in ('delivered', 'read')) as "whatsappDelivered",
        (select count(*)::int from ${whatsappMessage}
          where created_at >= ${since(DELIVERY_STATS_DAYS)}
            and status = 'failed') as "whatsappFailed",
        (select count(*)::int from ${heldNotificationRecipient}
          where channel = 'email' and sent_at is null) as "emailsHeld",
        (select count(*)::int from deliveries d
          join ${user} u on u.id = d.user_id
          join ${emailSuppression} es on es.email = lower(u.email)
          where es.created_at <= d.created_at
            and d.topic_id = any(${EMAIL_TOPICS})) as "emailsSuppressed"
    `),
    executor.execute(sql`
      select u.id, u.name from ${user} u
      where u.id in (
        select user_id from ${notification}
        where created_at >= ${since(DELIVERY_HISTORY_DAYS)}
        union
        select user_id from ${heldNotificationRecipient}
        where created_at >= ${since(DELIVERY_HISTORY_DAYS)}
        union
        select user_id from ${whatsappMessage}
        where created_at >= ${since(DELIVERY_HISTORY_DAYS)}
          and user_id is not null
      )
      order by u.name
    `),
  ]);
  const [stats] = statRows;
  return {
    recipients: [...recipients] as DeliveryOverview["recipients"],
    stats: {
      emailsHeld: Number(stats?.emailsHeld ?? 0),
      emailsSuppressed: Number(stats?.emailsSuppressed ?? 0),
      notificationsSent: Number(stats?.notificationsSent ?? 0),
      whatsappDelivered: Number(stats?.whatsappDelivered ?? 0),
      whatsappFailed: Number(stats?.whatsappFailed ?? 0),
    },
  };
}

export interface DeliveryPreview {
  inbox: { body: string; title: string } | null;
  /** The message sent, or the summary that included it. */
  whatsapp: (WhatsAppPreview & { summary: boolean }) | null;
}

/**
 * What the person saw: the inbox text and the WhatsApp message sent, or the
 * summary that carried it. The template is rendered from the body stored at
 * send time, falling back to today's definition for older rows.
 */
export async function queryDeliveryPreview(
  executor: Executor,
  { key, userId }: { key: string; userId: string | null }
): Promise<DeliveryPreview> {
  const [[inbox], [sent]] = await Promise.all([
    executor.execute<{ body: string; title: string }>(sql`
      select n.title, n.body from ${notification} n
      where n.user_id = ${userId}
        and n.idempotency_key in (${key}, ${key} || '-inbox',
          ${key} || '-inbox-' || ${userId})
      limit 1
    `),
    executor.execute<{
      params: Record<string, string> | null;
      summary: boolean;
      template: string;
      template_body: string | null;
    }>(sql`
      select w.template, w.template_body, w.params,
        w.idempotency_key like 'digest-%' as summary
      from ${whatsappMessage} w
      where w.idempotency_key in (${key}, ${key} || '-whatsapp-' || ${userId})
        or w.idempotency_key = (
          select 'digest-' || r.batch_id || '-whatsapp'
          from ${heldNotificationRecipient} r
          where r.held_key = ${key} and r.user_id = ${userId}
            and r.channel = 'whatsapp'
        )
      order by summary desc
      limit 1
    `),
  ]);
  const definition = sent
    ? WHATSAPP_TEMPLATES.find((t) => t.name === sent.template)
    : undefined;
  const body = sent?.template_body ?? definition?.body;
  return {
    inbox: inbox ? { body: inbox.body, title: inbox.title } : null,
    whatsapp:
      sent && body !== undefined
        ? {
            ...renderWhatsAppPreview({ ...definition, body }, sent.params),
            summary: sent.summary,
          }
        : null,
  };
}
