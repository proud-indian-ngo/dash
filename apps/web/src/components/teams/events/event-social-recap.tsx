import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Switch } from "@pi-dash/design-system/components/ui/switch";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  CHILDREN_ATTENDED_MAX,
  SOCIAL_NOTES_MAX_LENGTH,
} from "@pi-dash/shared/social-recap";
import { mutators } from "@pi-dash/zero/mutators";
import type { EventPhoto } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { useForm, useSelector } from "@tanstack/react-form";
import { format } from "date-fns";
import { useState } from "react";
import z from "zod";

import { CheckboxField } from "@/components/form/checkbox-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { TextareaField } from "@/components/form/textarea-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { DATE } from "@/lib/date-formats";
import { handleMutationResult } from "@/lib/mutation-result";

import { getPhotoThumbnailUrl, isVideoPhoto } from "./photo-utils";

const DIGITS_RE = /^\d+$/;

export const socialRecapFormSchema = z
  .object({
    childrenAttended: z.string().trim(),
    noChildren: z.boolean(),
    socialNotes: z
      .string()
      .max(
        SOCIAL_NOTES_MAX_LENGTH,
        `Keep it under ${SOCIAL_NOTES_MAX_LENGTH} characters`
      ),
  })
  .superRefine(({ childrenAttended, noChildren }, ctx) => {
    if (noChildren) {
      return;
    }
    let message: string | null = null;
    if (childrenAttended === "") {
      message = "Enter how many children came";
    } else if (!DIGITS_RE.test(childrenAttended)) {
      message = "Use a whole number";
    } else if (Number(childrenAttended) > CHILDREN_ATTENDED_MAX) {
      message = `At most ${CHILDREN_ATTENDED_MAX}`;
    }
    if (message) {
      ctx.addIssue({ code: "custom", message, path: ["childrenAttended"] });
    }
  });

type SocialRecapFormValues = z.infer<typeof socialRecapFormSchema>;

interface SocialRecapEvent {
  childrenAttended: number | null;
  id: string;
  socialCompletedAt: number | null;
  socialNotes: string | null;
}

interface EventSocialRecapProps {
  approvedPhotos: readonly EventPhoto[];
  event: SocialRecapEvent;
  presentCount: number;
}

function PhotoDoNotUseRow({ photo }: { photo: EventPhoto }) {
  const zero = useZero();
  const thumbnailUrl = getPhotoThumbnailUrl(photo);
  const label = photo.caption ?? (isVideoPhoto(photo) ? "Video" : "Photo");
  const switchId = `do-not-use-${photo.id}`;
  const handleChange = useEventCallback(async (checked: boolean) => {
    const res = await zero.mutate(
      mutators.eventPhoto.setDoNotUse({ doNotUse: checked, id: photo.id })
    ).server;
    handleMutationResult(res, {
      entityId: photo.id,
      errorMsg: "Couldn't update photo",
      mutation: "eventPhoto.setDoNotUse",
    });
  });

  return (
    <li className="flex items-center gap-3">
      <div className="bg-muted size-10 shrink-0 overflow-hidden rounded-md">
        {thumbnailUrl ? (
          <img
            alt={label}
            className={
              photo.doNotUse
                ? "size-full object-cover opacity-40"
                : "size-full object-cover"
            }
            height={40}
            loading="lazy"
            src={thumbnailUrl}
            width={40}
          />
        ) : null}
      </div>
      <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
        {label}
      </span>
      <Label className="text-sm font-normal" htmlFor={switchId}>
        Do not use
      </Label>
      <Switch
        checked={photo.doNotUse === true}
        id={switchId}
        onCheckedChange={handleChange}
      />
    </li>
  );
}

function RecapPhotos({ photos }: { photos: readonly EventPhoto[] }) {
  if (photos.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No approved photos yet. Upload them in the Photos tab below.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Photos</p>
      <ul aria-label="Recap photos" className="flex flex-col gap-2">
        {photos.map((photo) => (
          <PhotoDoNotUseRow key={photo.id} photo={photo} />
        ))}
      </ul>
    </div>
  );
}

function VolunteersAttended({ presentCount }: { presentCount: number }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">Volunteers attended</p>
      <p className="text-sm">
        <span className="font-mono tabular-nums" data-testid="recap-volunteers">
          {presentCount}
        </span>{" "}
        <span className="text-muted-foreground">
          marked present. Mark attendance in the Volunteers list.
        </span>
      </p>
    </div>
  );
}

const selectNoChildren = (state: { values: SocialRecapFormValues }) =>
  state.values.noChildren;

function RecapForm({
  event,
  isReady,
  onDone,
}: {
  event: SocialRecapEvent;
  isReady: boolean;
  onDone?: () => void;
}) {
  const zero = useZero();
  const form = useForm({
    defaultValues: {
      childrenAttended:
        event.childrenAttended === null ? "" : String(event.childrenAttended),
      // A ready recap with no count was saved as an event without children.
      noChildren: isReady && event.childrenAttended === null,
      socialNotes: event.socialNotes ?? "",
    } satisfies SocialRecapFormValues,
    onSubmit: async ({ value }) => {
      const res = await zero.mutate(
        mutators.teamEvent.saveSocialRecap({
          childrenAttended: value.noChildren
            ? null
            : Number(value.childrenAttended.trim()),
          eventId: event.id,
          markReady: true,
          now: Date.now(),
          socialNotes: value.socialNotes.trim() || null,
        })
      ).server;
      handleMutationResult(res, {
        entityId: event.id,
        errorMsg: "Couldn't save the recap",
        mutation: "teamEvent.saveSocialRecap",
        successMsg: isReady ? "Recap updated" : "Recap ready",
      });
      if (res.type !== "error") {
        onDone?.();
      }
    },
    validators: { onSubmit: socialRecapFormSchema },
  });
  const noChildren = useSelector(form.store, selectNoChildren);

  return (
    <FormLayout className="flex flex-col gap-4" form={form}>
      <CheckboxField
        description="For events like a lake cleanup or a volunteer meetup. The posts leave the children count out."
        label="No children at this event"
        name="noChildren"
      />
      {noChildren ? null : (
        <InputField
          className="max-w-32"
          inputMode="numeric"
          isRequired
          label="Children attended"
          name="childrenAttended"
          placeholder="0"
        />
      )}
      <TextareaField
        description={`One line for the post, up to ${SOCIAL_NOTES_MAX_LENGTH} characters.`}
        label="What happened"
        maxLength={SOCIAL_NOTES_MAX_LENGTH}
        name="socialNotes"
        placeholder="e.g. Built paper boats and raced them"
        rows={2}
      />
      <FormActions
        onCancel={onDone}
        submitLabel={isReady ? "Save recap" : "Mark recap ready"}
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

/**
 * Post-event social recap for team leads and attendance managers: the
 * figures and photo choices the social-artifacts pipeline reads.
 */
export function EventSocialRecap({
  approvedPhotos,
  event,
  presentCount,
}: EventSocialRecapProps) {
  const zero = useZero();
  const [editing, setEditing] = useState(false);
  const isReady = event.socialCompletedAt !== null;
  const stopEditing = useEventCallback(() => setEditing(false));
  const startEditing = useEventCallback(() => setEditing(true));
  const handleUndo = useEventCallback(async () => {
    const res = await zero.mutate(
      mutators.teamEvent.undoSocialRecap({ eventId: event.id, now: Date.now() })
    ).server;
    handleMutationResult(res, {
      entityId: event.id,
      errorMsg: "Couldn't undo the recap",
      mutation: "teamEvent.undoSocialRecap",
      successMsg: "Recap reopened",
    });
  });

  return (
    <Card aria-label="Social recap" role="region" size="sm">
      <CardHeader>
        <CardTitle>Social recap</CardTitle>
        {isReady && event.socialCompletedAt !== null ? (
          <CardDescription>
            <StatusBadge tone="success">
              Recap ready · {format(new Date(event.socialCompletedAt), DATE)}
            </StatusBadge>
          </CardDescription>
        ) : (
          <CardDescription>
            For the Instagram and LinkedIn posts about this session.
          </CardDescription>
        )}
        {isReady && !editing ? (
          <CardAction className="flex gap-2">
            <Button
              onClick={startEditing}
              size="sm"
              type="button"
              variant="outline"
            >
              Edit
            </Button>
            <Button
              onClick={handleUndo}
              size="sm"
              type="button"
              variant="ghost"
            >
              Undo
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isReady && !editing ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">
                Children attended
              </dt>
              {event.childrenAttended === null ? (
                <dd className="text-muted-foreground">No children</dd>
              ) : (
                <dd className="font-mono tabular-nums">
                  {event.childrenAttended}
                </dd>
              )}
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                Volunteers attended
              </dt>
              <dd className="font-mono tabular-nums">{presentCount}</dd>
            </div>
            {event.socialNotes ? (
              <div className="col-span-2">
                <dt className="text-muted-foreground text-xs">What happened</dt>
                <dd>{event.socialNotes}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <>
            <VolunteersAttended presentCount={presentCount} />
            <RecapForm
              event={event}
              isReady={isReady}
              onDone={isReady ? stopEditing : undefined}
            />
          </>
        )}
        <RecapPhotos photos={approvedPhotos} />
      </CardContent>
    </Card>
  );
}
