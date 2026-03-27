import { Button } from "@pi-dash/design-system/components/ui/button";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { format, formatDistanceToNow } from "date-fns";
import { log } from "evlog";
import { lazy, Suspense, useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";
import { getMyEventFeedback } from "@/functions/event-feedback";
import { LONG_DATE_TIME } from "@/lib/date-formats";
import { handleMutationResult } from "@/lib/mutation-result";

const PlateEditor = lazy(() =>
  import("@/components/editor/plate-editor").then((m) => ({
    default: m.PlateEditor,
  }))
);
const PlateRenderer = lazy(() =>
  import("@/components/editor/plate-renderer").then((m) => ({
    default: m.PlateRenderer,
  }))
);

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
  const [feedback] = useQuery(queries.eventFeedback.byEvent({ eventId }));

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
              <Suspense>
                <PlateRenderer content={item.content} />
              </Suspense>
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

  const handleSubmit = async (content: string) => {
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
          content,
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
          content,
          createdAt: now,
          updatedAt: now,
        });
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

  const handleUpdate = async (content: string) => {
    if (!myFeedback) {
      return;
    }
    setSaving(true);
    try {
      const res = await zero.mutate(
        mutators.eventFeedback.update({
          feedbackId: myFeedback.id,
          eventId,
          content,
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
          content,
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
    return <FeedbackCard feedback={myFeedback} />;
  }

  // Has existing feedback — view or edit
  if (myFeedback && !editing) {
    return (
      <div className="flex flex-col gap-4">
        <FeedbackCard feedback={myFeedback} />
        <div>
          <Button onClick={() => setEditing(true)} size="sm" variant="outline">
            Edit
          </Button>
        </div>
      </div>
    );
  }

  // Editing existing feedback
  if (myFeedback && editing) {
    return (
      <Suspense>
        <PlateEditor
          content={myFeedback.content}
          entityId={eventId}
          key={`edit-${myFeedback.id}`}
          onCancel={() => setEditing(false)}
          onSave={handleUpdate}
          saving={saving}
        />
      </Suspense>
    );
  }

  // New submission
  return (
    <Suspense>
      <PlateEditor
        entityId={eventId}
        key="create"
        onSave={handleSubmit}
        saving={saving}
      />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Shared read-only feedback card
// ---------------------------------------------------------------------------

function FeedbackCard({ feedback }: { feedback: MyFeedback }) {
  const isEdited = feedback.updatedAt !== feedback.createdAt;
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <Suspense>
        <PlateRenderer content={feedback.content} />
      </Suspense>
      <span className="text-muted-foreground text-xs">
        Submitted{" "}
        {formatDistanceToNow(new Date(feedback.createdAt), {
          addSuffix: true,
        })}
        {isEdited ? " (edited)" : ""}
      </span>
    </div>
  );
}
