import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Edit02Icon,
  SentIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import {
  addDays,
  boardOn,
  DEED_VERSION_1,
  TRUSTEE_OFFICE_LABELS,
  type TrusteeOffice,
} from "@pi-dash/shared/governance";
import {
  kolkataParts,
  MEETING_MODE_LABELS,
  noticeProblem,
  PRESENCE_LABELS,
  type Presence,
  presenceValues,
} from "@pi-dash/shared/meetings";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { MeetingAgenda } from "@/components/governance/meeting-agenda";
import {
  errorText,
  formatStartsAt,
  type MeetingDetail,
  useMeetingDetail,
} from "@/components/governance/meeting-data";
import { MeetingFormDialog } from "@/components/governance/meeting-form-dialog";
import { MeetingMinutesPanel } from "@/components/governance/meeting-minutes-panel";
import { MeetingStatusBadge } from "@/components/governance/meeting-status";
import { PlainSelect } from "@/components/governance/plain-select";
import {
  formatIso,
  toDeedVersionView,
  todayIso,
  useRegister,
} from "@/components/governance/register-data";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
import { useApp } from "@/context/app-context";
import { markMeetingHeldFn, sendMeetingNoticeFn } from "@/functions/meetings";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";
import { preloadRouteQuery } from "@/lib/route-preload";

export const Route = createFileRoute("/_app/governance/meetings/$meetingId")({
  component: MeetingPage,
  head: () => ({
    meta: [{ title: `Board meeting | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context, params }) => {
    preloadRouteQuery(
      context.zero,
      queries.meeting.byId({ id: params.meetingId }),
      abortController.signal
    );
  },
});

const officeText = (offices: readonly TrusteeOffice[] | null | undefined) =>
  (offices ?? []).map((o) => TRUSTEE_OFFICE_LABELS[o]).join(", ");

function Fact({
  label,
  children,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function MeetingPage() {
  const { meetingId } = Route.useParams();
  const { hasPermission, user } = useApp();
  const canManage = hasPermission("governance.manage");
  const canSee = canManage || hasPermission("governance.view");
  const [row, result] = useMeetingDetail(meetingId);

  if (!row) {
    return (
      <div className="app-container mx-auto max-w-5xl px-2 py-6 sm:px-4">
        {result.type === "complete" ? (
          <p className="text-muted-foreground text-sm">
            This meeting doesn't exist, or its notice didn't go to you.
          </p>
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
      </div>
    );
  }
  return (
    <MeetingView
      canManage={canManage}
      canSee={canSee}
      meeting={row}
      userId={user.id}
    />
  );
}

function MeetingView({
  canManage,
  canSee,
  meeting,
  userId,
}: {
  canManage: boolean;
  canSee: boolean;
  meeting: MeetingDetail;
  userId: string;
}) {
  const zero = useZero();
  const sendNotice = useServerFn(sendMeetingNoticeFn);
  const markHeld = useServerFn(markMeetingHeldFn);
  const meetingOn = kolkataParts(meeting.startsAt).date;
  const today = todayIso();
  const { inForce, input, trustees } = useRegister(meetingOn);
  const [circulars] = useQuery(queries.resolution.all());
  const [editing, setEditing] = useState(false);
  const [noticing, setNoticing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const status = meeting.status ?? "draft";
  const started = Date.now() >= meeting.startsAt;
  // The deed in force on the meeting's date, as the server decides by;
  // the version recorded with the notice is the fallback for trustees who
  // can't read the deed versions.
  const version =
    inForce ??
    (meeting.deedVersion ? toDeedVersionView(meeting.deedVersion) : undefined);
  const rules = version?.rules ?? DEED_VERSION_1.rules;
  const board = boardOn(input, meetingOn);
  const attendance = meeting.attendance ?? [];
  const names = new Map<string, string>([
    ...trustees.map((t) => [t.id, t.legalName] as const),
    ...attendance.map(
      (a) => [a.trusteeId, a.trustee?.legalName ?? ""] as const
    ),
  ]);
  const chairUserId = attendance.find(
    (a) => a.trusteeId === meeting.chairTrusteeId
  )?.trustee?.userId;
  const noted = new Map(
    circulars.map((c) => [c.id, { number: c.number ?? null, title: c.title }])
  );
  const problem =
    status === "draft" ? noticeProblem(rules, today, meetingOn) : null;
  const inOffice = status === "draft" ? board.length : attendance.length;
  const canEdit = canManage && (status === "draft" || status === "convened");
  const canRecord = canManage && status === "convened" && started;

  const handleNotice = useEventCallback(async () => {
    setBusy(true);
    try {
      const out = await sendNotice({ data: { id: meeting.id } });
      toast.success(`Notice sent to ${out.trustees} trustees`);
      setNoticing(false);
    } catch (error) {
      toast.error("The notice didn't go out", {
        description: errorText(error, "Something went wrong"),
      });
    } finally {
      setBusy(false);
    }
  });
  const handleClose = useEventCallback(async () => {
    setBusy(true);
    try {
      await markHeld({ data: { id: meeting.id } });
      toast.success("Meeting closed. Make the minutes next.");
      setClosing(false);
    } catch (error) {
      toast.error("Couldn't close the meeting", {
        description: errorText(error, "Something went wrong"),
      });
    } finally {
      setBusy(false);
    }
  });
  const handleCancel = useEventCallback(async () => {
    const out = await zero.mutate(
      mutators.meeting.cancel({ id: meeting.id, reason })
    ).server;
    handleMutationResult(out, {
      entityId: meeting.id,
      errorMsg: `Couldn't cancel it: ${getMutationResultErrorMessage(out.type === "error" ? out.error : undefined, "something went wrong")}`,
      mutation: "meeting.cancel",
      successMsg: "Meeting cancelled",
    });
    if (out.type !== "error") {
      setCancelling(false);
    }
  });
  const setChair = useEventCallback(async (value: string) => {
    const out = await zero.mutate(
      mutators.meeting.setChair({
        chairTrusteeId: value || null,
        id: meeting.id,
      })
    ).server;
    handleMutationResult(out, {
      entityId: meeting.id,
      errorMsg: `Couldn't set the chair: ${getMutationResultErrorMessage(out.type === "error" ? out.error : undefined, "something went wrong")}`,
      mutation: "meeting.setChair",
      successMsg: "Chair recorded",
    });
  });
  const setPresence = useEventCallback(async (id: string, presence: string) => {
    const out = await zero.mutate(
      mutators.meetingAttendance.set({ id, presence: presence as Presence })
    ).server;
    if (out.type === "error") {
      toast.error(
        getMutationResultErrorMessage(out.error, "Couldn't record attendance")
      );
    }
  });

  const menuActions = [
    canEdit && {
      icon: Edit02Icon,
      id: "edit",
      label: "Edit meeting",
      onSelect: () => setEditing(true),
    },
    canEdit && {
      destructive: true,
      icon: Cancel01Icon,
      id: "cancel",
      label: "Cancel meeting",
      onSelect: () => setCancelling(true),
    },
  ];
  const chairOptions = (
    status === "draft"
      ? board.map((m) => ({ id: m.trustee.id, offices: m.offices }))
      : attendance.map((a) => ({ id: a.trusteeId, offices: a.offices }))
  ).map((m) => ({
    label: `${names.get(m.id) ?? "A trustee"}${m.offices.length ? ` (${officeText(m.offices)})` : ""}`,
    value: m.id,
  }));
  const noticeBy = addDays(meetingOn, -rules.noticeDays);

  return (
    <div className="app-container mx-auto max-w-5xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          <>
            {status === "draft" && canManage ? (
              <Button
                disabled={!!problem}
                onClick={() => setNoticing(true)}
                type="button"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={SentIcon}
                  strokeWidth={2}
                />
                Send notice
              </Button>
            ) : null}
            {status === "convened" && canManage && started ? (
              <Button onClick={() => setClosing(true)} type="button">
                <HugeiconsIcon
                  className="size-4"
                  icon={CheckmarkCircle02Icon}
                  strokeWidth={2}
                />
                Close the meeting
              </Button>
            ) : null}
            {menuActions.some(Boolean) ? (
              <PageHeaderMenu actions={menuActions} title="Meeting actions" />
            ) : null}
          </>
        }
        description={`${formatStartsAt(meeting.startsAt)} · ${meeting.place || MEETING_MODE_LABELS[meeting.mode ?? "hybrid"]}`}
        title={meeting.title}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <MeetingStatusBadge status={status} />
        {meeting.noticeSentAt ? (
          <span className="text-muted-foreground">
            Notice sent {formatStartsAt(meeting.noticeSentAt)}
          </span>
        ) : null}
        {status === "cancelled" && meeting.cancelledReason ? (
          <span className="text-muted-foreground">
            Cancelled: {meeting.cancelledReason}
          </span>
        ) : null}
      </div>

      {problem && canManage ? (
        <p className="text-warning-foreground mt-4 rounded-md border p-3 text-sm">
          {problem} Move the meeting to a later day to send the notice.
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-6">
        <section className="rounded-md border p-4">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Fact label="Starts">{formatStartsAt(meeting.startsAt)}</Fact>
            <Fact label="Where">
              {MEETING_MODE_LABELS[meeting.mode ?? "hybrid"]}
              {meeting.place ? `, ${meeting.place}` : ""}
            </Fact>
            <Fact label="Under">
              {version
                ? `Deed version ${version.number}, in force from ${formatIso(version.effectiveFrom)}`
                : "The trust deed"}
            </Fact>
            <Fact label="Notice">
              {meeting.noticeSentAt
                ? `Sent ${formatStartsAt(meeting.noticeSentAt)}`
                : `${rules.noticeDays} days: send by ${formatIso(noticeBy)}`}
            </Fact>
            <Fact label="Chair">
              {canEdit && chairOptions.length > 0 ? (
                <PlainSelect
                  className="max-w-xs"
                  label="Chair of the meeting"
                  onChange={setChair}
                  options={[
                    { label: "Not chosen", value: "" },
                    ...chairOptions,
                  ]}
                  value={meeting.chairTrusteeId ?? ""}
                />
              ) : (
                (meeting.chair?.legalName ??
                (meeting.chairTrusteeId
                  ? names.get(meeting.chairTrusteeId)
                  : null) ??
                "Not chosen")
              )}
            </Fact>
          </dl>
        </section>

        {status === "draft" ? (
          <section className="rounded-md border p-4">
            <h2 className="text-base font-semibold">Notice goes to</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              The trustees in office on {formatIso(meetingOn)}:{" "}
              {board.length > 0
                ? board.map((m) => m.trustee.legalName).join(", ")
                : "none"}
              .
            </p>
          </section>
        ) : null}

        {attendance.length > 0 ? (
          <section
            aria-labelledby="attendance-heading"
            className="flex flex-col gap-3 rounded-md border p-4"
          >
            <h2 className="text-base font-semibold" id="attendance-heading">
              Attendance
            </h2>
            {status === "convened" && !started ? (
              <p className="text-muted-foreground text-sm">
                Attendance is taken once the meeting starts.
              </p>
            ) : null}
            <ul className="flex flex-col divide-y">
              {[...attendance]
                .sort((a, b) =>
                  (names.get(a.trusteeId) ?? "").localeCompare(
                    names.get(b.trusteeId) ?? ""
                  )
                )
                .map((a) => {
                  const name = names.get(a.trusteeId) ?? "A trustee";
                  return (
                    <li
                      className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                      key={a.id}
                    >
                      <span className="flex flex-col">
                        <span>{name}</span>
                        <span className="text-muted-foreground text-xs">
                          {officeText(a.offices) || "Trustee"}
                        </span>
                      </span>
                      {canRecord ? (
                        <PlainSelect
                          className="w-48"
                          label={`Attendance of ${name}`}
                          onChange={(value) => setPresence(a.id, value)}
                          options={presenceValues.map((value) => ({
                            label: PRESENCE_LABELS[value],
                            value,
                          }))}
                          value={a.presence ?? "absent"}
                        />
                      ) : (
                        <span className="text-muted-foreground">
                          {started || status !== "convened"
                            ? PRESENCE_LABELS[a.presence ?? "absent"]
                            : "—"}
                        </span>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        ) : null}

        <MeetingAgenda
          canEdit={canEdit}
          canRecord={canRecord}
          inOffice={inOffice}
          meeting={meeting}
          names={names}
          noted={noted}
          rules={rules}
          trustees={trustees}
        />

        {status === "held" ? (
          <MeetingMinutesPanel
            canManage={canManage}
            isChair={!!chairUserId && chairUserId === userId}
            meeting={meeting}
          />
        ) : null}
        {canSee ? null : (
          <p className="text-muted-foreground text-xs">
            You see this meeting because its notice went to you.
          </p>
        )}
      </div>

      {editing ? (
        <MeetingFormDialog
          dateLocked={status !== "draft"}
          initial={{
            mode: meeting.mode ?? "hybrid",
            place: meeting.place ?? null,
            startsAt: meeting.startsAt,
            title: meeting.title,
          }}
          meetingId={meeting.id}
          mode="update"
          onOpenChange={setEditing}
          open
        />
      ) : null}
      <ConfirmDialog
        confirmLabel="Send notice"
        description={`The notice and agenda go to the ${board.length} trustees in office on ${formatIso(meetingOn)}. Circular resolutions passed since the last meeting are added to the agenda to be noted. The day and time can't change afterwards.`}
        loading={busy}
        onConfirm={handleNotice}
        onOpenChange={setNoticing}
        open={noticing}
        title="Send the notice?"
      />
      <ConfirmDialog
        confirmLabel="Close the meeting"
        description="Attendance and votes are fixed once the meeting is closed. Every resolution on the agenda must be decided first."
        loading={busy}
        onConfirm={handleClose}
        onOpenChange={setClosing}
        open={closing}
        title="Close the meeting?"
      />
      <ConfirmDialog
        confirmDisabled={!reason.trim()}
        confirmLabel="Cancel meeting"
        description={
          <span className="flex flex-col gap-1.5 pt-2">
            <Label htmlFor="cancel-reason">Reason</Label>
            <Textarea
              id="cancel-reason"
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              value={reason}
            />
          </span>
        }
        onConfirm={handleCancel}
        onOpenChange={setCancelling}
        open={cancelling}
        title="Cancel the meeting?"
        variant="destructive"
      />
    </div>
  );
}
