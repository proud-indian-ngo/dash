import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { log } from "evlog";
import { type ReactNode, useEffect, useState } from "react";

import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { DetailsCard, DetailsRow } from "@/components/shared/record-detail";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import {
  type DeliveryPreview,
  getDeliveryPreview,
} from "@/functions/notification-delivery";
import {
  type DeliveryRow,
  deliverySubtitle,
  EMAIL_STATUS,
  type EmailLogFacts,
  formatIndiaTime,
  type HeldFacts,
  INBOX_STATUS,
  WHATSAPP_STATUS,
  type WhatsAppLogFacts,
} from "@/lib/notification-delivery";

function Row({ label, value }: { label: string; value: ReactNode }) {
  return value === null || value === "" ? null : (
    <DetailsRow label={label}>{value}</DetailsRow>
  );
}

function StatusRow({
  display,
}: {
  display: { label: string; tone: StatusTone };
}) {
  return (
    <DetailsRow label="Status">
      <StatusBadge tone={display.tone}>{display.label}</StatusBadge>
    </DetailsRow>
  );
}

/** When the message was held, batched and finished with on this channel. */
function HeldRows({ held }: { held: HeldFacts | null }) {
  if (!held) {
    return null;
  }
  return (
    <>
      <Row label="Held" value={formatIndiaTime(held.createdAt)} />
      <Row
        label="Batched"
        value={
          held.claimedAt === null
            ? null
            : `${formatIndiaTime(held.claimedAt)}, ${held.batchSize === 1 ? "on its own" : `with ${held.batchSize - 1} more`}`
        }
      />
      <Row
        label="Attempts"
        value={held.attempts > 0 ? String(held.attempts + 1) : null}
      />
      <Row
        label="Done"
        value={held.sentAt === null ? null : formatIndiaTime(held.sentAt)}
      />
    </>
  );
}

/** A Cloud API send log row; the summary's shows its own status. */
function LogRows({
  log,
  summary = false,
}: {
  log: WhatsAppLogFacts | null;
  summary?: boolean;
}) {
  if (!log) {
    return null;
  }
  return (
    <>
      <Row
        label={summary ? "Summary" : "Template"}
        value={
          summary
            ? `${WHATSAPP_STATUS[log.status].label}, ${log.template}`
            : log.template
        }
      />
      <Row label="Sent" value={formatIndiaTime(log.createdAt)} />
      <Row label="Last update" value={formatIndiaTime(log.updatedAt)} />
      <Row label="Error" value={log.error} />
    </>
  );
}

/** An email delivery log row; the summary's shows its own status. */
function EmailLogRows({
  log,
  summary = false,
}: {
  log: EmailLogFacts | null;
  summary?: boolean;
}) {
  if (!log) {
    return null;
  }
  return (
    <>
      {summary ? (
        <Row label="Summary" value={EMAIL_STATUS[log.status].label} />
      ) : null}
      <Row label="Sent" value={formatIndiaTime(log.createdAt)} />
      <Row label="Last update" value={formatIndiaTime(log.updatedAt)} />
      <Row label="Reason" value={log.error} />
    </>
  );
}

/** A full-width entry in a details card, for message contents. */
function MessageRow({ children }: { children: ReactNode }) {
  return (
    <div>
      <dt className="sr-only">Message</dt>
      <dd>{children}</dd>
    </div>
  );
}

function PreviewSkeleton() {
  return <Skeleton className="h-16 w-full rounded-lg" />;
}

function InboxPreview({ inbox }: { inbox: DeliveryPreview["inbox"] }) {
  if (!inbox) {
    return null;
  }
  return (
    <div className="bg-muted/50 rounded-lg px-4 py-3">
      <p className="text-[13px] leading-snug font-semibold">{inbox.title}</p>
      <p className="text-muted-foreground mt-1.5 text-[13px] leading-relaxed">
        {inbox.body}
      </p>
    </div>
  );
}

/** The WhatsApp message as sent, or the summary that carried it. */
function WhatsAppPreview({
  message,
}: {
  message: DeliveryPreview["whatsapp"];
}) {
  if (!message) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      {message.summary ? (
        <p className="text-muted-foreground text-sm">
          Sent inside this summary:
        </p>
      ) : null}
      <div
        className="bg-muted/50 max-w-sm rounded-lg text-sm"
        data-testid="whatsapp-preview"
      >
        <div className="flex flex-col gap-1 px-3 py-2">
          {message.header ? (
            <p className="font-semibold">{message.header}</p>
          ) : null}
          <p className="break-words whitespace-pre-wrap">
            {message.body.map((line, i) => (
              <span key={i}>
                {i > 0 ? "\n" : null}
                {line.map((run, j) =>
                  run.bold ? (
                    <strong key={j}>{run.text}</strong>
                  ) : (
                    <span key={j}>{run.text}</span>
                  )
                )}
              </span>
            ))}
          </p>
          <p className="text-muted-foreground text-xs">{message.footer}</p>
        </div>
        {message.button ? (
          <p className="text-primary border-t px-3 py-2 text-center font-medium">
            {message.button}
          </p>
        ) : null}
      </div>
      {message.filled ? null : (
        <p className="text-muted-foreground text-sm">
          The exact values weren't recorded for this message.
        </p>
      )}
    </div>
  );
}

type PreviewState =
  | { status: "loading" }
  | { status: "error" }
  | { preview: DeliveryPreview; status: "loaded" };

/**
 * Loads the message contents for the open row. The result is kept with the
 * row it belongs to, so a newly opened row never shows the last one's.
 */
function useDeliveryPreview(row: DeliveryRow | null): PreviewState {
  const [loaded, setLoaded] = useState<{
    id: string;
    state: PreviewState;
  } | null>(null);
  const id = row?.id;
  const key = row?.key;
  const userId = row?.userId ?? null;
  useEffect(() => {
    if (id === undefined || key === undefined) {
      return;
    }
    let cancelled = false;
    getDeliveryPreview({ data: { key, userId } })
      .then((preview) => {
        if (!cancelled) {
          setLoaded({ id, state: { preview, status: "loaded" } });
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "fetchPreview",
          component: "DeliveryDetailSheet",
          error: error instanceof Error ? error.message : String(error),
        });
        if (!cancelled) {
          setLoaded({ id, state: { status: "error" } });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, key, userId]);
  return loaded !== null && loaded.id === id
    ? loaded.state
    : { status: "loading" };
}

/** The message once loaded, a skeleton until then, or the load error. */
function PreviewSlot({
  children,
  state,
}: {
  children: (preview: DeliveryPreview) => ReactNode;
  state: PreviewState;
}) {
  if (state.status === "loading") {
    return <PreviewSkeleton />;
  }
  if (state.status === "error") {
    return (
      <p className="text-muted-foreground text-sm">Couldn't load the message</p>
    );
  }
  return children(state.preview);
}

export function DeliveryDetailSheet({
  onOpenChange,
  open,
  row,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  row: DeliveryRow | null;
}) {
  const preview = useDeliveryPreview(row);
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        {row ? (
          <>
            <DetailSheetHeader
              meta={[
                row.recipientName ?? "Unknown",
                deliverySubtitle(row),
                formatIndiaTime(row.createdAt),
              ]}
              title={row.title}
            />
            <div className="flex flex-col gap-4 px-6 pb-6">
              <DetailsCard title="Inbox">
                <StatusRow display={INBOX_STATUS[row.inbox]} />
                <MessageRow>
                  <PreviewSlot state={preview}>
                    {(loaded) => <InboxPreview inbox={loaded.inbox} />}
                  </PreviewSlot>
                </MessageRow>
              </DetailsCard>

              <DetailsCard title="WhatsApp">
                <StatusRow display={WHATSAPP_STATUS[row.whatsapp]} />
                <HeldRows held={row.whatsappHeld} />
                <LogRows log={row.whatsappLog} />
                <LogRows log={row.whatsappSummaryLog} summary />
                <MessageRow>
                  <PreviewSlot state={preview}>
                    {(loaded) => <WhatsAppPreview message={loaded.whatsapp} />}
                  </PreviewSlot>
                </MessageRow>
              </DetailsCard>

              <DetailsCard title="Email">
                <StatusRow display={EMAIL_STATUS[row.email]} />
                <HeldRows held={row.emailHeld} />
                <EmailLogRows log={row.emailLog} />
                <EmailLogRows log={row.emailSummaryLog} summary />
                <Row
                  label="Suppressed"
                  value={
                    row.suppressedAt === null
                      ? null
                      : `Since ${formatIndiaTime(row.suppressedAt)}`
                  }
                />
                {row.email === "not_tracked" ? (
                  <p className="text-muted-foreground text-sm">
                    There's no delivery log for this email.
                  </p>
                ) : null}
              </DetailsCard>

              <DetailsCard title="Trace">
                <Row
                  label="Key"
                  value={
                    <span className="font-mono text-xs break-all">
                      {row.key}
                    </span>
                  }
                />
              </DetailsCard>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
