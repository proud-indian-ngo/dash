import {
  Delete02Icon,
  Edit02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Checkbox } from "@pi-dash/design-system/components/ui/checkbox";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useIsMobile } from "@pi-dash/design-system/hooks/use-mobile";
import type { DeedRules } from "@pi-dash/shared/governance";
import {
  countedVotes,
  countsPresent,
  itemResult,
  MEETING_NOTES_MAX,
  PRESENCE_LABELS,
  VOTE_CHOICE_LABELS,
  type VoteChoice,
  voteChoiceValues,
} from "@pi-dash/shared/meetings";
import {
  RESOLUTION_TEMPLATES,
  thresholdFor,
} from "@pi-dash/shared/resolutions";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { decideAgendaItemFn } from "@/functions/meetings";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";

import type {
  AgendaItemView,
  AttendanceView,
  MeetingDetail,
} from "./meeting-data";
import { errorText } from "./meeting-data";
import { PlainSelect } from "./plain-select";
import type { RegisterTrustee } from "./register-data";
import { draftValuesFrom, ResolutionDraftForm } from "./resolution-draft-form";
import { SegmentedChoice } from "./segmented-choice";

const choiceOptions = voteChoiceValues.map((value) => ({
  label: VOTE_CHOICE_LABELS[value],
  short: value === "abstain" ? "Abstain" : undefined,
  value,
}));
const OUTCOME = {
  failed: { label: "Not passed", tone: "danger" },
  no_decision: { label: "No decision", tone: "warning" },
  passed: { label: "Passed", tone: "success" },
} as const;

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export interface AgendaContext {
  /** Votes and attendance can be recorded: convened, started, and the person manages governance. */
  canRecord: boolean;
  /** The agenda can change: draft or convened, and the person manages governance. */
  canEdit: boolean;
  /** Trustees in office on the meeting's date. */
  inOffice: number;
  meeting: MeetingDetail;
  names: Map<string, string>;
  /** Circulars noted at the meeting, by id. */
  noted: Map<string, { number: string | null; title: string }>;
  rules: DeedRules;
  /** For the register change on a new resolution. */
  trustees: readonly RegisterTrustee[];
}

export function MeetingAgenda(props: AgendaContext) {
  const { canEdit, meeting } = props;
  const [adding, setAdding] = useState<null | {
    itemId: string;
    kind: "resolution" | "discussion";
    resolutionId: string;
  }>(null);
  const agenda = meeting.agenda ?? [];
  return (
    <section
      aria-labelledby="agenda-heading"
      className="flex flex-col gap-4 rounded-md border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold" id="agenda-heading">
          Agenda
        </h2>
        {canEdit ? (
          <span className="flex flex-wrap gap-2">
            {meeting.status === "draft" ? (
              <Button
                onClick={() =>
                  setAdding({
                    itemId: uuidv7(),
                    kind: "resolution",
                    resolutionId: uuidv7(),
                  })
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={PlusSignIcon}
                  strokeWidth={2}
                />
                Add a resolution
              </Button>
            ) : null}
            <Button
              onClick={() =>
                setAdding({
                  itemId: uuidv7(),
                  kind: "discussion",
                  resolutionId: "",
                })
              }
              size="sm"
              type="button"
              variant="outline"
            >
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Add a discussion item
            </Button>
          </span>
        ) : null}
      </div>
      {agenda.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing on the agenda yet.
        </p>
      ) : null}
      <ol className="flex flex-col gap-4">
        {agenda.map((item) => (
          <AgendaItemCard context={props} item={item} key={item.id} />
        ))}
      </ol>
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setAdding(null);
          }
        }}
        open={adding?.kind === "resolution"}
      >
        <DialogContent className="sm:max-w-(--dialog-lg)">
          <DialogHeader>
            <DialogTitle>Add a resolution</DialogTitle>
            <DialogDescription>
              The Board votes on it at the meeting. It gets its number when it
              passes.
            </DialogDescription>
          </DialogHeader>
          {adding?.kind === "resolution" ? (
            <ResolutionDraftForm
              agenda={{ itemId: adding.itemId, meetingId: meeting.id }}
              draftId={adding.resolutionId}
              initial={draftValuesFrom({
                body: RESOLUTION_TEMPLATES.ordinary.text,
                effect: { type: "none" },
                templateKey: "ordinary",
                title: "",
              })}
              mode="create"
              onCancel={() => setAdding(null)}
              onSaved={() => setAdding(null)}
              trustees={props.trustees}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      {adding?.kind === "discussion" ? (
        <DiscussionDialog
          itemId={adding.itemId}
          meetingId={meeting.id}
          onClose={() => setAdding(null)}
        />
      ) : null}
    </section>
  );
}

function DiscussionDialog({
  itemId,
  meetingId,
  onClose,
}: {
  itemId: string;
  meetingId: string;
  onClose: () => void;
}) {
  const zero = useZero();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const save = useEventCallback(async () => {
    if (!title.trim()) {
      return;
    }
    setBusy(true);
    const result = await zero.mutate(
      mutators.agendaItem.add({
        id: itemId,
        meetingId,
        notes: notes.trim() || null,
        resolution: null,
        title: title.trim(),
      })
    ).server;
    setBusy(false);
    handleMutationResult(result, {
      entityId: itemId,
      errorMsg: `Couldn't add it: ${getMutationResultErrorMessage(result.type === "error" ? result.error : undefined, "something went wrong")}`,
      mutation: "agendaItem.add",
      successMsg: "Added to the agenda",
    });
    if (result.type !== "error") {
      onClose();
    }
  });
  return (
    <ConfirmDialog
      confirmDisabled={!title.trim()}
      confirmLabel="Add to agenda"
      description={
        <span className="flex flex-col gap-3 pt-2">
          <span className="flex flex-col gap-1.5">
            <Label htmlFor="discussion-title">Title</Label>
            <input
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              id="discussion-title"
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              value={title}
            />
          </span>
          <span className="flex flex-col gap-1.5">
            <Label htmlFor="discussion-notes">Notes for the minutes</Label>
            <Textarea
              id="discussion-notes"
              maxLength={MEETING_NOTES_MAX}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              value={notes}
            />
          </span>
        </span>
      }
      loading={busy}
      onConfirm={save}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
      title="Add a discussion item"
    />
  );
}

function AgendaItemCard({
  context,
  item,
}: {
  context: AgendaContext;
  item: AgendaItemView;
}) {
  const zero = useZero();
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [removing, setRemoving] = useState(false);
  const decided = item.outcome ? OUTCOME[item.outcome] : null;
  const isOpen = !item.outcome || item.outcome === "no_decision";
  const signed = !!context.meeting.minutesDocumentId;
  const canEditNotes =
    context.canEdit ||
    (context.meeting.status === "held" && !signed && context.canRecord);

  const saveNotes = useEventCallback(async () => {
    const result = await zero.mutate(
      mutators.agendaItem.setNotes({ id: item.id, notes })
    ).server;
    handleMutationResult(result, {
      entityId: item.id,
      errorMsg: `Couldn't save the notes: ${getMutationResultErrorMessage(result.type === "error" ? result.error : undefined, "something went wrong")}`,
      mutation: "agendaItem.setNotes",
      successMsg: "Notes saved",
    });
    if (result.type !== "error") {
      setEditingNotes(false);
    }
  });
  const remove = useEventCallback(async () => {
    const result = await zero.mutate(
      mutators.agendaItem.remove({ id: item.id })
    ).server;
    handleMutationResult(result, {
      entityId: item.id,
      errorMsg: `Couldn't remove it: ${getMutationResultErrorMessage(result.type === "error" ? result.error : undefined, "something went wrong")}`,
      mutation: "agendaItem.remove",
      successMsg: "Removed from the agenda",
    });
    setRemoving(false);
  });

  return (
    <li className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h3 className="text-sm font-semibold">
            {item.position}. {item.title}
          </h3>
          <span className="text-muted-foreground text-xs">
            {item.kind === "resolution" ? "Resolution" : null}
            {item.kind === "discussion" ? "For discussion" : null}
            {item.kind === "note_circulars" ? "To note" : null}
            {item.resolution?.number ? ` · ${item.resolution.number}` : ""}
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {decided ? (
            <StatusBadge tone={decided.tone}>{decided.label}</StatusBadge>
          ) : null}
          {canEditNotes ? (
            <Button
              aria-label={`Edit notes on ${item.title}`}
              onClick={() => {
                setNotes(item.notes ?? "");
                setEditingNotes(true);
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon
                className="size-4"
                icon={Edit02Icon}
                strokeWidth={2}
              />
            </Button>
          ) : null}
          {context.canEdit && isOpen && item.kind !== "note_circulars" ? (
            <Button
              aria-label={`Remove ${item.title}`}
              onClick={() => setRemoving(true)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon
                className="size-4"
                icon={Delete02Icon}
                strokeWidth={2}
              />
            </Button>
          ) : null}
        </span>
      </div>
      {item.resolution
        ? paragraphs(item.resolution.body).map((p, i) => (
            <p className="text-sm whitespace-pre-line" key={`b${String(i)}`}>
              {p}
            </p>
          ))
        : null}
      {item.kind === "note_circulars" ? (
        <ul className="flex flex-col gap-1 text-sm">
          {(item.notedResolutionIds ?? []).map((id) => {
            const r = context.noted.get(id);
            return (
              <li key={id}>
                <span className="font-mono">{r?.number ?? "—"}</span>{" "}
                <span className="text-muted-foreground">{r?.title ?? ""}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {item.notes ? (
        <div className="bg-muted/40 rounded-md p-3 text-sm">
          {paragraphs(item.notes).map((p, i) => (
            <p className="whitespace-pre-line" key={`n${String(i)}`}>
              {p}
            </p>
          ))}
        </div>
      ) : null}
      {item.kind === "resolution" ? (
        <ItemVotes context={context} item={item} />
      ) : null}
      {editingNotes ? (
        <ConfirmDialog
          confirmLabel="Save notes"
          description={
            <span className="flex flex-col gap-1.5 pt-2">
              <Label htmlFor={`notes-${item.id}`}>Notes for the minutes</Label>
              <Textarea
                id={`notes-${item.id}`}
                maxLength={MEETING_NOTES_MAX}
                onChange={(e) => setNotes(e.target.value)}
                rows={6}
                value={notes}
              />
            </span>
          }
          onConfirm={saveNotes}
          onOpenChange={setEditingNotes}
          open
          title={item.title}
        />
      ) : null}
      <ConfirmDialog
        confirmLabel="Remove"
        description={
          item.resolutionId
            ? "The item and its draft resolution are removed."
            : "The item is removed from the agenda."
        }
        onConfirm={remove}
        onOpenChange={setRemoving}
        open={removing}
        title="Remove from the agenda?"
        variant="destructive"
      />
    </li>
  );
}

function ItemVotes({
  context,
  item,
}: {
  context: AgendaContext;
  item: AgendaItemView;
}) {
  const zero = useZero();
  const isMobile = useIsMobile();
  const decide = useServerFn(decideAgendaItemFn);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const { meeting, names, rules } = context;
  const attendance = [...(meeting.attendance ?? [])].sort((a, b) =>
    (names.get(a.trusteeId) ?? "").localeCompare(names.get(b.trusteeId) ?? "")
  );
  const votes = item.votes ?? [];
  const isOpen = !item.outcome || item.outcome === "no_decision";
  const editable = context.canRecord && isOpen;
  // Once decided, the item shows the attendance and chair it was decided on.
  const basis = editable ? null : (item.decisionBasis ?? null);
  const presenceOf = (a: AttendanceView) =>
    (basis
      ? basis.attendance.find((b) => b.trusteeId === a.trusteeId)?.presence
      : a.presence) ?? "absent";

  const rows = attendance.map((a) => ({
    offices: a.offices,
    presence: presenceOf(a),
    trusteeId: a.trusteeId,
  }));
  const voteRows = votes.map((v) => ({
    absenteeWritten: v.absenteeWritten ?? false,
    choice: v.choice,
    conflict: v.conflict ?? false,
    trusteeId: v.trusteeId,
  }));
  const resolution = item.resolution ?? {
    effect: { type: "none" },
    templateKey: "ordinary",
  };
  const preview = itemResult({
    attendance: rows,
    castingVote: item.castingVote ?? null,
    chairTrusteeId: basis
      ? basis.chairTrusteeId
      : (meeting.chairTrusteeId ?? null),
    inOffice: basis?.inOffice ?? context.inOffice,
    resolution,
    rules,
    votes: voteRows,
  });
  const counted = new Set(
    countedVotes({ attendance: rows, resolution, rules, votes: voteRows }).map(
      (v) => v.trusteeId
    )
  );
  const { quorum } = preview;
  const majority =
    thresholdFor(
      RESOLUTION_TEMPLATES[item.resolution?.templateKey ?? "ordinary"],
      rules
    ) === "majority_in_office";
  const tied = quorum.quorate && majority && preview.for === preview.against;

  const setVote = useEventCallback(
    async (
      a: AttendanceView,
      next: {
        choice?: VoteChoice | null;
        conflict?: boolean;
        written?: boolean;
      }
    ) => {
      const existing = votes.find((v) => v.trusteeId === a.trusteeId);
      if (next.choice === null) {
        const result = await zero.mutate(
          mutators.agendaVote.clear({
            agendaItemId: item.id,
            trusteeId: a.trusteeId,
          })
        ).server;
        if (result.type === "error") {
          toast.error(
            getMutationResultErrorMessage(
              result.error,
              "Couldn't clear the vote"
            )
          );
        }
        return;
      }
      const present = countsPresent(rules, a.presence ?? "absent");
      const result = await zero.mutate(
        mutators.agendaVote.set({
          absenteeWritten:
            next.written ?? existing?.absenteeWritten ?? !present,
          agendaItemId: item.id,
          choice: next.choice ?? existing?.choice ?? "abstain",
          conflict: next.conflict ?? existing?.conflict ?? false,
          id: existing?.id ?? uuidv7(),
          trusteeId: a.trusteeId,
        })
      ).server;
      if (result.type === "error") {
        toast.error(
          getMutationResultErrorMessage(
            result.error,
            "Couldn't record the vote"
          )
        );
      }
    }
  );
  const setCasting = useEventCallback(async (value: string) => {
    const result = await zero.mutate(
      mutators.agendaItem.setCastingVote({
        choice: value ? (value as VoteChoice) : null,
        id: item.id,
      })
    ).server;
    if (result.type === "error") {
      toast.error(
        getMutationResultErrorMessage(result.error, "Couldn't record it")
      );
    }
  });
  const handleDecide = useEventCallback(async () => {
    setBusy(true);
    // The server decides from the database, and attendance and votes reach it
    // through Zero. Zero applies this client's writes in order, so once this
    // one lands, everything marked before it has too. A casting vote
    // only stands on a tie.
    const flushed = await zero.mutate(
      mutators.agendaItem.setCastingVote({
        choice: tied ? (item.castingVote ?? null) : null,
        id: item.id,
      })
    ).server;
    if (flushed.type === "error") {
      toast.error(
        getMutationResultErrorMessage(
          flushed.error,
          "Couldn't record the decision"
        )
      );
      setBusy(false);
      return;
    }
    await decide({ data: { id: meeting.id, itemId: item.id } })
      .then((out) => {
        if (out.outcome === "passed") {
          toast.success(`Passed as ${out.number ?? "a resolution"}`);
        } else if (out.outcome === "failed") {
          toast.success("Recorded: not passed");
        } else {
          toast.warning("No decision: the meeting isn't quorate for this item");
        }
        setConfirming(false);
      })
      .catch((error: unknown) => {
        toast.error("Couldn't record the decision", {
          description: errorText(error, "Something went wrong"),
        });
      })
      .finally(() => setBusy(false));
  });

  const marks = attendance.map((a) => {
    const vote = votes.find((v) => v.trusteeId === a.trusteeId);
    const name = names.get(a.trusteeId) ?? "A trustee";
    return {
      id: a.id,
      interestControl: (
        <Checkbox
          aria-label={`${name} declared an interest`}
          checked={vote?.conflict ?? false}
          onCheckedChange={(checked) =>
            setVote(a, { conflict: Boolean(checked) })
          }
        />
      ),
      name,
      present: countsPresent(rules, presenceOf(a)),
      presenceText:
        basis || a.markedAt ? PRESENCE_LABELS[presenceOf(a)] : "Not marked",
      vote,
      voteControl: (
        <SegmentedChoice
          label={`Vote of ${name}`}
          onChange={(choice) => setVote(a, { choice })}
          options={choiceOptions}
          value={vote?.choice ?? null}
        />
      ),
      voteText: vote?.conflict
        ? "Took no part"
        : vote
          ? `${VOTE_CHOICE_LABELS[vote.choice]}${counted.has(vote.trusteeId) ? "" : " (not counted)"}`
          : "—",
      writingControl: (
        <Checkbox
          aria-label={`${name} sent views in writing`}
          checked={vote?.absenteeWritten ?? false}
          disabled={!vote || Boolean(vote.conflict)}
          onCheckedChange={(checked) =>
            setVote(a, { written: Boolean(checked) })
          }
        />
      ),
    };
  });

  if (!context.canRecord && votes.length === 0 && !item.outcome) {
    return (
      <p className="text-muted-foreground text-sm">
        {meeting.status === "held"
          ? "No votes were recorded."
          : "Votes are recorded at the meeting."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={quorum.quorate ? "success" : "danger"}>
          {quorum.quorate ? "Quorum met" : "Quorum not met"} · {quorum.counted}{" "}
          of {quorum.needed}
        </StatusBadge>
        {quorum.quorate ? null : (
          <span className="text-muted-foreground text-xs">{quorum.reason}</span>
        )}
      </div>
      {isMobile ? (
        // Phones: one framed list, each trustee's vote under their name, so
        // the four columns don't squeeze names to a word per line.
        <ul className="divide-y rounded-md border text-sm">
          {marks.map((m) => (
            <li className="flex flex-col gap-2 px-3 py-2.5" key={m.id}>
              <span className="flex flex-col">
                <span>{m.name}</span>
                <span className="text-muted-foreground text-xs">
                  {m.presenceText}
                </span>
              </span>
              {editable ? (
                <>
                  {m.vote?.conflict ? <span>{m.voteText}</span> : m.voteControl}
                  <span className="flex flex-wrap gap-x-4">
                    <Label className="flex items-center gap-2 font-normal pointer-coarse:min-h-10">
                      {m.interestControl}
                      Declared an interest
                    </Label>
                    {m.present ? null : (
                      <Label className="flex items-center gap-2 font-normal pointer-coarse:min-h-10">
                        {m.writingControl}
                        Views in writing
                      </Label>
                    )}
                  </span>
                </>
              ) : (
                <span>
                  {m.vote ? m.voteText : "No vote"}
                  {!m.present && m.vote?.absenteeWritten ? " · in writing" : ""}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Trustee</th>
                <th className="px-3 py-2 text-left font-medium">Vote</th>
                <th className="px-3 py-2 text-left font-medium">
                  Interest declared
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  Views in writing
                </th>
              </tr>
            </thead>
            <tbody>
              {marks.map((m) => (
                <tr className="border-t" key={m.id}>
                  <td className="px-3 py-2">
                    <span className="flex flex-col">
                      <span>{m.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {m.presenceText}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {editable && !m.vote?.conflict ? (
                      m.voteControl
                    ) : (
                      <span>{m.voteText}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editable ? (
                      m.interestControl
                    ) : (
                      <span className="text-sm">
                        {m.vote?.conflict ? "Declared" : "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {m.present ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : null}
                    {!m.present && !editable ? (
                      <span className="text-sm">
                        {m.vote?.absenteeWritten ? "In writing" : "—"}
                      </span>
                    ) : null}
                    {!m.present && editable ? m.writingControl : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div
        className="flex flex-col gap-1 text-sm"
        data-testid={`tally-${item.id}`}
      >
        <span className="text-muted-foreground">
          {preview.for} for, {preview.against} against
        </span>
        {item.outcomeNote ? (
          <span className="text-muted-foreground">{item.outcomeNote}</span>
        ) : null}
      </div>
      {editable && tied && rules.castingVote === "chair" ? (
        <div className="flex max-w-xs flex-col gap-1.5">
          <Label htmlFor={`casting-${item.id}`}>The chair's casting vote</Label>
          <PlainSelect
            id={`casting-${item.id}`}
            onChange={setCasting}
            options={[
              { label: "Not given", value: "" },
              { label: "For", value: "for" },
              { label: "Against", value: "against" },
            ]}
            value={item.castingVote ?? ""}
          />
        </div>
      ) : null}
      {editable ? (
        <div>
          <Button onClick={() => setConfirming(true)} type="button">
            Record the decision
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        confirmLabel="Record the decision"
        description={
          preview.outcome === "passed"
            ? `It passes, ${preview.for} for and ${preview.against} against. It gets the next resolution number and any register change is made. This can't be undone.`
            : preview.outcome === "failed"
              ? `It doesn't pass: ${preview.reason ?? ""} This can't be undone.`
              : `No decision can be made: ${preview.reason ?? ""} The resolution stays open for a later meeting.`
        }
        loading={busy}
        onConfirm={handleDecide}
        onOpenChange={setConfirming}
        open={confirming}
        title="Record the decision?"
      />
    </div>
  );
}
