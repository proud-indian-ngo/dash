import { cn } from "@pi-dash/design-system/lib/utils";
import type { AttachmentDownloadRef } from "@pi-dash/shared/asset-ref";
import { format } from "date-fns";
import upperFirst from "lodash/upperFirst";
import type { ReactNode } from "react";

import {
  getAttachmentDownloadHref,
  getAttachmentLabel,
  getAttachmentPreviewHref,
} from "@/lib/attachment-links";
import { DATE_TIME } from "@/lib/date-formats";

/**
 * A record page's body: the working content on the left and one column of
 * facts on the right (stacked under it on narrow screens). Pages that have
 * no facts beyond their header pass no `aside` and get the full width.
 */
export function RecordDetailLayout({
  aside,
  children,
}: {
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-6",
        aside && "lg:grid-cols-[minmax(0,1fr)_20rem]"
      )}
    >
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
      {aside ? (
        <aside aria-label="Details" className="flex flex-col gap-4">
          {aside}
        </aside>
      ) : null}
    </div>
  );
}

/** A titled section of the main column. */
export function RecordSection({
  action,
  children,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  title: string;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A card of label/value facts for the right-hand column. */
export function DetailsCard({
  children,
  title = "Details",
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <section aria-label={title} className="rounded-xl border p-4">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      <dl className="flex flex-col gap-2.5">{children}</dl>
    </section>
  );
}

export function DetailsRow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

/** Why a record was rejected, shown above its content. */
export function RejectionNote({
  label = "Rejected",
  reason,
}: {
  label?: string;
  reason: string;
}) {
  return (
    <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm">
      <span className="font-medium">{label}: </span>
      {reason}
    </div>
  );
}

interface AttachmentItem {
  filename?: string | null;
  id: string;
  mimeType?: string | null;
  objectKey?: string | null;
  type: "file" | "url";
  url?: string | null;
}

const LINK_CLASS =
  "text-primary text-xs font-medium underline-offset-2 hover:underline";

/**
 * Files and links on a record, one framed list. `kind` names the protected
 * attachment route the preview and download links go through.
 */
type RecordAttachmentKind = Exclude<
  AttachmentDownloadRef,
  { kind: "scheduledMessageAttachment" }
>["kind"];

export function AttachmentList({
  attachments,
  kind,
}: {
  attachments: readonly AttachmentItem[];
  kind: RecordAttachmentKind;
}) {
  return (
    <ul className="divide-y rounded-lg border">
      {attachments.map((att) => {
        const label = getAttachmentLabel(att);
        const ref = { id: att.id, kind } as AttachmentDownloadRef;
        return (
          <li
            className="flex min-h-10 min-w-0 items-center justify-between gap-3 px-3 py-1.5"
            key={att.id}
          >
            <span className="min-w-0 truncate text-sm">{label}</span>
            <span className="flex shrink-0 items-center gap-3">
              {att.type === "url" ? (
                <a
                  className={LINK_CLASS}
                  href={getAttachmentPreviewHref(att)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View link
                  <span className="sr-only"> {label} (opens in new tab)</span>
                </a>
              ) : (
                <>
                  <a
                    className={LINK_CLASS}
                    href={getAttachmentPreviewHref(att, ref)}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Preview
                    <span className="sr-only"> {label} (opens in new tab)</span>
                  </a>
                  <a
                    className={LINK_CLASS}
                    download
                    href={getAttachmentDownloadHref(att, ref)}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Download
                    <span className="sr-only"> {label} (opens in new tab)</span>
                  </a>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** "invoice_submitted" → "Invoice submitted". */
export function formatHistoryAction(action: string): string {
  return upperFirst(action.replaceAll("_", " ").toLowerCase());
}

interface HistoryItem {
  action: string;
  createdAt: number;
  id: string;
  note: string | null;
}

/** What happened to a record, newest last, as a compact timeline card. */
export function HistoryCard({ entries }: { entries: readonly HistoryItem[] }) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <section aria-label="History" className="rounded-xl border p-4">
      <h2 className="mb-3 text-sm font-medium">History</h2>
      <ol className="flex flex-col">
        {entries.map((entry, index) => (
          <li className="flex gap-3" key={entry.id}>
            <div
              aria-hidden="true"
              className="flex flex-col items-center pt-1.5"
            >
              <span className="bg-muted-foreground/50 size-1.5 rounded-full" />
              {index < entries.length - 1 ? (
                <span className="bg-border w-px flex-1" />
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col pb-3">
              <span className="text-sm font-medium">
                {formatHistoryAction(entry.action)}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {format(entry.createdAt, DATE_TIME)}
              </span>
              {entry.note ? (
                <span className="text-muted-foreground mt-0.5 text-sm">
                  {entry.note}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
