import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useRef } from "react";

import { ComboboxField } from "./combobox-field";
import type { SelectOption } from "./select-field";

/**
 * The programme a request should carry after its event changes. The event's
 * programme replaces the current one only while the user has not chosen a
 * programme of their own: the field is empty or still holds the previous
 * event's programme. Clearing the event keeps the current programme.
 */
export function programmeAfterEventChange({
  current,
  nextEventProgrammeId,
  previousEventProgrammeId,
}: {
  current: string | undefined;
  nextEventProgrammeId: string | undefined;
  previousEventProgrammeId: string | undefined;
}): string | undefined {
  if (!nextEventProgrammeId) {
    return current;
  }
  if (!current || current === previousEventProgrammeId) {
    return nextEventProgrammeId;
  }
  return current;
}

/** Active programmes, plus the request's current one if it was deactivated. */
export function useRequestProgrammeOptions(
  currentProgrammeId: string | undefined
): SelectOption[] {
  const [programmes, programmesResult] = useQuery(queries.programme.all());
  const options = programmes
    .filter((p) => p.active || p.id === currentProgrammeId)
    .map((p) => ({
      label: p.active ? p.name : `${p.name} (inactive)`,
      value: p.id,
    }));
  if (
    programmesResult.type === "complete" &&
    currentProgrammeId &&
    !options.some((o) => o.value === currentProgrammeId)
  ) {
    options.push({ label: "Current programme", value: currentProgrammeId });
  }
  return options;
}

interface ProgrammeListenerProps {
  fieldApi: { name: string; state: { value: unknown } };
  formApi: {
    getFieldValue: (name: "programmeId") => unknown;
    setFieldValue: (name: "programmeId", value: string) => void;
  };
}

/**
 * A form-level `listeners.onChange` handler that fills the programme from the
 * event the user picks, following `programmeAfterEventChange`.
 */
export function useEventProgrammeDefault(
  eventProgrammeId: (eventId: string | undefined) => string | undefined,
  initialEventId: string | undefined
) {
  const previous = useRef<{ programmeId: string | undefined } | null>(null);
  return useEventCallback(({ fieldApi, formApi }: ProgrammeListenerProps) => {
    if (fieldApi.name !== "eventId") {
      return;
    }
    const previousEventProgrammeId = (
      previous.current ?? { programmeId: eventProgrammeId(initialEventId) }
    ).programmeId;
    const nextEventProgrammeId = eventProgrammeId(
      (fieldApi.state.value as string | undefined) || undefined
    );
    previous.current = { programmeId: nextEventProgrammeId };
    const current =
      (formApi.getFieldValue("programmeId") as string | undefined) || undefined;
    const programmeId = programmeAfterEventChange({
      current,
      nextEventProgrammeId,
      previousEventProgrammeId,
    });
    if (programmeId && programmeId !== current) {
      formApi.setFieldValue("programmeId", programmeId);
    }
  });
}

export function RequestProgrammeField({
  options,
}: {
  options: SelectOption[];
}) {
  return (
    <ComboboxField
      description="The programme this money is spent under."
      emptyMessage="No matching programmes."
      isRequired
      label="Programme"
      name="programmeId"
      options={options}
      placeholder="Search programmes"
    />
  );
}
