import { Button } from "@pi-dash/design-system/components/ui/button";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { EventFeedback } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { format, formatDistanceToNow } from "date-fns";
import { log } from "evlog";
import { useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";
import { getMyEventFeedback } from "@/functions/event-feedback";
import { LONG_DATE_TIME } from "@/lib/date-formats";
import { handleMutationResult } from "@/lib/mutation-result";

interface EventFeedbackSectionProps {
  canManageFeedback: boolean;
  eventId: string;
  feedbackDeadline: number | null;
  feedbackDeadlinePassed: boolean;
  isMember: boolean;
}

export function EventFeedbackSection({
  canManageFeedback,
  eventId,
  feedbackDeadline,
  feedbackDeadlinePassed,
  isMember,
}: EventFeedbackSectionProps) {
  if (canManageFeedback) {
    return (
      <EventFeedbackAdmin
        eventId={eventId}
        feedbackDeadline={feedbackDeadline}
        feedbackDeadlinePassed={feedbackDeadlinePassed}
      />
    );
  }

  if (isMember) {
    return (
      <EventFeedbackParticipant
        eventId={eventId}
        feedbackDeadlinePassed={feedbackDeadlinePassed}
      />
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Admin view — anonymous feedback list
// ---------------------------------------------------------------------------

interface EventFeedbackAdminProps {
  eventId: string;
  feedbackDeadline: number | null;
  feedbackDeadlinePassed: boolean;
}

function EventFeedbackAdmin({
  eventId,
  feedbackDeadline,
  feedbackDeadlinePassed,
}: EventFeedbackAdminProps) {
  const result = useQuery(queries.eventFeedback.byEvent({ eventId }));
  const feedback = result[0] as readonly EventFeedback[];

  return (
    <div className="flex flex-col gap-4">
      {feedbackDeadline ? (
        <p className="text-muted-foreground text-sm">
          Feedback deadline:{" "}
          {format(new Date(feedbackDeadline), LONG_DATE_TIME)}
          {feedbackDeadlinePassed ? " (closed)" : " (open)"}
        </p>
      ) : null}

      {feedback.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm">
          No feedback submitted yet.
        </p>
      ) : (
        feedback.map((item) => {
          const isEdited = item.updatedAt !== item.createdAt;
          return (
            <div
              className="flex flex-col gap-2 rounded-lg border p-4"
              key={item.id}
            >
              <p className="whitespace-pre-wrap text-sm">{item.content}</p>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  {formatDistanceToNow(new Date(item.createdAt), {
                    addSuffix: true,
                  })}
                </span>
                {isEdited ? (
                  <span className="text-muted-foreground text-xs">
                    (edited)
                  </span>
                ) : null}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Participant view — submit / edit own feedback
// ---------------------------------------------------------------------------

interface MyFeedback {
  content: string;
  createdAt: number;
  id: string;
  updatedAt: number;
}

async function fetchFeedbackForEvent(
  eventId: string
): Promise<MyFeedback | null> {
  const result = await getMyEventFeedback({ data: { eventId } });
  if (!result) {
    return null;
  }
  return {
    id: result.id,
    content: result.content,
    createdAt: new Date(result.createdAt).getTime(),
    updatedAt: new Date(result.updatedAt).getTime(),
  };
}

interface EventFeedbackParticipantProps {
  eventId: string;
  feedbackDeadlinePassed: boolean;
}

function EventFeedbackParticipant({
  eventId,
  feedbackDeadlinePassed,
}: EventFeedbackParticipantProps) {
  const zero = useZero();
  const [loading, setLoading] = useState(true);
  const [myFeedback, setMyFeedback] = useState<MyFeedback | null>(null);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchFeedbackForEvent(eventId)
      .then((result) => {
        if (!cancelled) {
          setMyFeedback(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          log.error({
            component: "EventFeedbackParticipant",
            action: "fetchMyFeedback",
            eventId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const handleSubmit = async () => {
    if (!content.trim()) {
      return;
    }
    setSaving(true);
    try {
      const feedbackId = uuidv7();
      const submissionId = uuidv7();
      const now = Date.now();
      const res = await zero.mutate(
        mutators.eventFeedback.submit({
          feedbackId,
          submissionId,
          eventId,
          content: content.trim(),
          now,
        })
      ).server;
      handleMutationResult(res, {
        mutation: "eventFeedback.submit",
        entityId: feedbackId,
        successMsg: "Feedback submitted",
        errorMsg: "Failed to submit feedback",
      });
      if (res.type !== "error") {
        setMyFeedback({
          id: feedbackId,
          content: content.trim(),
          createdAt: now,
          updatedAt: now,
        });
        setContent("");
      }
    } catch (err) {
      log.error({
        component: "EventFeedbackParticipant",
        action: "submit",
        eventId,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!(content.trim() && myFeedback)) {
      return;
    }
    setSaving(true);
    try {
      const res = await zero.mutate(
        mutators.eventFeedback.update({
          eventId,
          content: content.trim(),
          now: Date.now(),
        })
      ).server;
      handleMutationResult(res, {
        mutation: "eventFeedback.update",
        entityId: myFeedback.id,
        successMsg: "Feedback updated",
        errorMsg: "Failed to update feedback",
      });
      if (res.type !== "error") {
        const now = Date.now();
        setMyFeedback({
          ...myFeedback,
          content: content.trim(),
          updatedAt: now,
        });
        setEditing(false);
      }
    } catch (err) {
      log.error({
        component: "EventFeedbackParticipant",
        action: "update",
        eventId,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <p className="text-center text-muted-foreground text-sm">
        Loading feedback...
      </p>
    );
  }

  // Deadline passed
  if (feedbackDeadlinePassed) {
    if (!myFeedback) {
      return (
        <p className="text-center text-muted-foreground text-sm">
          Feedback period has ended.
        </p>
      );
    }
    return (
      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <p className="whitespace-pre-wrap text-sm">{myFeedback.content}</p>
        <span className="text-muted-foreground text-xs">
          Submitted{" "}
          {formatDistanceToNow(new Date(myFeedback.createdAt), {
            addSuffix: true,
          })}
          {myFeedback.updatedAt === myFeedback.createdAt ? "" : " (edited)"}
        </span>
      </div>
    );
  }

  // Has existing feedback — view or edit
  if (myFeedback && !editing) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-lg border p-4">
          <p className="whitespace-pre-wrap text-sm">{myFeedback.content}</p>
          <span className="text-muted-foreground text-xs">
            Submitted{" "}
            {formatDistanceToNow(new Date(myFeedback.createdAt), {
              addSuffix: true,
            })}
            {myFeedback.updatedAt === myFeedback.createdAt ? "" : " (edited)"}
          </span>
        </div>
        <div>
          <Button
            onClick={() => {
              setContent(myFeedback.content);
              setEditing(true);
            }}
            size="sm"
            variant="outline"
          >
            Edit
          </Button>
        </div>
      </div>
    );
  }

  // Editing existing feedback
  if (myFeedback && editing) {
    return (
      <div className="flex flex-col gap-4">
        <Textarea
          onChange={(e) => setContent(e.target.value)}
          placeholder="Update your feedback..."
          rows={4}
          value={content}
        />
        <div className="flex gap-2">
          <Button disabled={saving || !content.trim()} onClick={handleUpdate}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button
            disabled={saving}
            onClick={() => {
              setEditing(false);
              setContent("");
            }}
            variant="ghost"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // New submission
  return (
    <div className="flex flex-col gap-4">
      <Textarea
        onChange={(e) => setContent(e.target.value)}
        placeholder="Share your anonymous feedback..."
        rows={4}
        value={content}
      />
      <div>
        <Button disabled={saving || !content.trim()} onClick={handleSubmit}>
          {saving ? "Submitting..." : "Submit"}
        </Button>
      </div>
    </div>
  );
}
