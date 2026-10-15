import type { EmailStatus } from "@pi-dash/email";
import { formatPaise } from "@pi-dash/shared/money";
import type { DigestRow } from "@pi-dash/shared/notification-digest";

import { stripLeadingEmoji } from "./text";
import { TOPIC_CATALOG } from "./topics";

/** One held notification, as it goes into a digest. */
export interface DigestEntry {
  body: string;
  clickAction: string | null;
  digest?: DigestRow | null;
  title: string;
}

export interface DigestItem {
  actionLabel: string;
  amount?: string;
  meta?: string;
  name: string;
  status?: EmailStatus;
  url?: string;
}

/** Rows that share a title, under that title when the digest has several. */
export interface DigestSection {
  items: DigestItem[];
  title?: string;
  /** Rows in this section, including any past the limit. */
  total: number;
}

export interface Digest {
  cta?: { label: string; url: string };
  heading: string;
  intro: string;
  /** Rows left out of `sections`. */
  moreCount: number;
  /** Inbox preview text: the first few row names. */
  preview: string;
  sections: DigestSection[];
  /** The heading and topic, so digests from different topics don't thread together. */
  subject: string;
}

const PREVIEW_NAMES = 3;

function previewOf(names: string[]): string {
  const shown = names.slice(0, PREVIEW_NAMES).join(", ");
  const rest = names.length - PREVIEW_NAMES;
  return rest > 0 ? `${shown} and ${rest} more` : shown;
}

export const DIGEST_EMAIL_ITEM_LIMIT = 20;
export const DIGEST_WHATSAPP_ITEM_LIMIT = 10;
const WHATSAPP_META_LIMIT = 200;

function topicName(topicId: string): string {
  return TOPIC_CATALOG.find((t) => t.id === topicId)?.name ?? topicId;
}

function topicLabel(topicId: string): string {
  const topic = TOPIC_CATALOG.find((t) => t.id === topicId);
  if (!topic) {
    return topicId;
  }
  return topic.group === topic.name
    ? topic.name
    : `${topic.group} · ${topic.name}`;
}

function absoluteUrl(
  path: string | null | undefined,
  appUrl: string | undefined
): string | undefined {
  if (!path) {
    return undefined;
  }
  if (path.startsWith("/")) {
    return appUrl ? `${appUrl}${path}` : undefined;
  }
  return path;
}

/** An entry standing for `repeats` notifications about the same thing. */
interface Collapsed extends DigestEntry {
  repeats: number;
}

function withRepeats(
  meta: string | undefined,
  repeats: number
): string | undefined {
  if (repeats < 2) {
    return meta;
  }
  return meta ? `${meta} · ${repeats} updates` : `${repeats} updates`;
}

function toItem(entry: Collapsed, appUrl: string | undefined): DigestItem {
  const row = entry.digest;
  const url = absoluteUrl(entry.clickAction, appUrl);
  if (!row) {
    return {
      actionLabel: "View",
      meta: withRepeats(entry.body, entry.repeats),
      name: stripLeadingEmoji(entry.title),
      url,
    };
  }
  return {
    actionLabel: row.actionLabel ?? "View",
    amount:
      row.amountPaise === undefined ? undefined : formatPaise(row.amountPaise),
    meta: withRepeats(row.meta, entry.repeats),
    name: row.name,
    status: row.status,
    url,
  };
}

/**
 * Several notifications about the same record and of the same kind (an
 * event updated three times) become one row with the latest wording. A
 * different amount keeps rows apart: two payments logged on one record are
 * two things to review.
 */
function collapseRepeats(entries: DigestEntry[]): Collapsed[] {
  const byKey = new Map<string, Collapsed>();
  for (const entry of entries) {
    const key = [
      headingOf(entry.title),
      entry.clickAction ?? "",
      entry.digest?.name ?? entry.body,
      entry.digest?.amountPaise ?? "",
    ].join("\n");
    const earlier = byKey.get(key);
    // Re-inserting moves the row to where its latest update arrived.
    byKey.delete(key);
    byKey.set(key, { ...entry, repeats: (earlier?.repeats ?? 0) + 1 });
  }
  return [...byKey.values()];
}

/** The list every row points to, when they all point to the same one. */
function sharedList(
  entries: DigestEntry[],
  appUrl: string | undefined
): Digest["cta"] {
  const [first] = entries;
  const list = first?.digest?.list;
  const url = absoluteUrl(list?.path, appUrl);
  if (!(list && url)) {
    return appUrl ? { label: "Open dashboard", url: appUrl } : undefined;
  }
  const shared = entries.every((e) => e.digest?.list?.path === list.path);
  if (!shared) {
    return appUrl ? { label: "Open dashboard", url: appUrl } : undefined;
  }
  return { label: list.label, url };
}

/** A title as a heading: no leading emoji, no closing "!" or "?". */
function headingOf(title: string): string {
  return stripLeadingEmoji(title).replace(/[!?]+$/u, "");
}

/**
 * Several notifications in one topic as one message. With one title, the
 * heading carries it ("New invoice (4)"). With several, rows are grouped
 * under their titles in the order they arrived, unless every group would
 * hold a single row: then one flat list reads better.
 */
export function buildDigest(
  entries: DigestEntry[],
  topicId: string,
  options: { appUrl?: string; limit: number }
): Digest {
  const rows = collapseRepeats(entries);
  const byTitle = new Map<string, Collapsed[]>();
  for (const entry of rows) {
    const title = headingOf(entry.title);
    byTitle.set(title, [...(byTitle.get(title) ?? []), entry]);
  }
  const grouped = [...byTitle.values()].some((group) => group.length > 1);
  const groups = grouped ? byTitle : new Map([["", rows]]);

  // A status every row shares says nothing; keep it only to tell rows apart.
  const statuses = new Set(rows.map((e) => e.digest?.status?.label));
  const toRow = (entry: Collapsed): DigestItem => {
    const item = toItem(entry, options.appUrl);
    return statuses.size > 1 ? item : { ...item, status: undefined };
  };

  let remaining = options.limit;
  const sections: DigestSection[] = [];
  for (const [title, group] of groups) {
    const shown = group.slice(0, Math.max(remaining, 0));
    remaining -= shown.length;
    if (shown.length > 0) {
      sections.push({
        items: shown.map(toRow),
        title: groups.size > 1 ? title : undefined,
        total: group.length,
      });
    }
  }

  const count = rows.length;
  const [onlyTitle] = byTitle.keys();
  let heading = `${count} new notifications`;
  if (byTitle.size === 1 && onlyTitle) {
    heading = count > 1 ? `${onlyTitle} (${count})` : onlyTitle;
  }
  return {
    cta: sharedList(entries, options.appUrl),
    heading,
    intro: `From ${topicLabel(topicId)}.`,
    moreCount: count - Math.min(count, options.limit),
    preview: previewOf(rows.map((entry) => toItem(entry, undefined).name)),
    sections,
    subject: `${heading} · ${topicName(topicId)}`,
  };
}

function whatsAppFooter(appName: string, appUrl: string | undefined): string {
  return appUrl ? `\n\n_Sent by ${appName}_(${appUrl})` : "";
}

/** The WhatsApp text for one notification. */
export function buildWhatsAppText(options: {
  appName: string;
  appUrl: string | undefined;
  body: string;
  clickAction?: string;
  imageUrl?: string;
  title: string;
}): string {
  const { appName, appUrl, body, clickAction, imageUrl, title } = options;
  const whatsappBody =
    clickAction && appUrl ? `${body}\n\nView: ${appUrl}${clickAction}` : body;
  const imageSuffix = imageUrl ? `\n\nPayment proof: ${imageUrl}` : "";
  return `*${title}*\n\n${whatsappBody}${imageSuffix}${whatsAppFooter(appName, appUrl)}`;
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

function whatsAppRow(item: DigestItem, n: number): string {
  const extras = [item.amount, item.status?.label].filter(Boolean).join(" · ");
  const lines = [`${n}. *${item.name}*${extras ? ` · ${extras}` : ""}`];
  if (item.meta) {
    lines.push(truncate(item.meta, WHATSAPP_META_LIMIT));
  }
  if (item.url) {
    lines.push(`View: ${item.url}`);
  }
  return lines.join("\n");
}

/** The WhatsApp text for several notifications in one topic. */
export function buildWhatsAppDigestText(
  entries: DigestEntry[],
  topicId: string,
  options: { appName: string; appUrl: string | undefined }
): string {
  const digest = buildDigest(entries, topicId, {
    appUrl: options.appUrl,
    limit: DIGEST_WHATSAPP_ITEM_LIMIT,
  });
  let n = 0;
  const blocks = digest.sections.map((section) => {
    const rows = section.items.map((item) => {
      n += 1;
      return whatsAppRow(item, n);
    });
    const heading = section.title
      ? `_${section.title} · ${section.total}_\n\n`
      : "";
    return `${heading}${rows.join("\n\n")}`;
  });
  const more = digest.moreCount > 0 ? `\n\nAnd ${digest.moreCount} more.` : "";
  return `*${digest.heading}*\n\n${digest.intro}\n\n${blocks.join("\n\n")}${more}${whatsAppFooter(options.appName, options.appUrl)}`;
}
