import { Label } from "@pi-dash/design-system/components/ui/label";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@pi-dash/design-system/components/ui/toggle-group";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { ReminderTarget } from "@pi-dash/shared/constants";
import { REMINDER_PRESETS } from "@pi-dash/shared/event-reminders";

interface ReminderIntervalsFieldProps {
  hasWhatsappGroup: boolean;
  onChange: (value: number[]) => void;
  onTargetChange: (value: ReminderTarget) => void;
  reminderTarget: ReminderTarget;
  value: number[];
}

export function ReminderIntervalsField({
  hasWhatsappGroup,
  onChange,
  onTargetChange,
  reminderTarget,
  value,
}: ReminderIntervalsFieldProps) {
  const showGroupWarning =
    !hasWhatsappGroup &&
    (reminderTarget === "group" || reminderTarget === "both");
  const stableOnValueChange0 = useEventCallback((selected: string[]) =>
    onChange(selected.map(Number))
  );
  const stableOnValueChange1 = useEventCallback((selected: string[]) => {
    const val = selected.at(-1);
    if (val) {
      onTargetChange(val as ReminderTarget);
    }
  });

  return (
    <div className="space-y-2">
      <Label>Reminders</Label>
      <ToggleGroup
        aria-describedby="reminder-help"
        multiple
        onValueChange={stableOnValueChange0}
        spacing={1}
        value={value.map(String)}
        variant="outline"
      >
        {REMINDER_PRESETS.map((preset) => (
          <ToggleGroupItem
            className="aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            key={preset.minutes}
            size="sm"
            value={String(preset.minutes)}
          >
            {preset.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {value.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Send to</Label>
          <ToggleGroup
            onValueChange={stableOnValueChange1}
            value={[reminderTarget]}
            variant="outline"
          >
            <ToggleGroupItem
              className="aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              size="sm"
              value="participants"
            >
              Participants
            </ToggleGroupItem>
            <ToggleGroupItem
              className="aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              size="sm"
              value="group"
            >
              Group
            </ToggleGroupItem>
            <ToggleGroupItem
              className="aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              size="sm"
              value="both"
            >
              Both
            </ToggleGroupItem>
          </ToggleGroup>
          {Boolean(showGroupWarning) && (
            <p className="text-warning text-xs">
              No WhatsApp group linked — only participants will be reminded
            </p>
          )}
        </div>
      )}
      <p className="text-muted-foreground text-xs" id="reminder-help">
        Select when to send reminders before the event starts
      </p>
    </div>
  );
}
