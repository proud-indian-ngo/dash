import { Label } from "@pi-dash/design-system/components/ui/label";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@pi-dash/design-system/components/ui/toggle-group";
import { REMINDER_PRESETS } from "@pi-dash/shared/event-reminders";

interface ReminderIntervalsFieldProps {
  onChange: (value: number[]) => void;
  value: number[];
}

export function ReminderIntervalsField({
  onChange,
  value,
}: ReminderIntervalsFieldProps) {
  return (
    <div className="space-y-2">
      <Label>Reminders</Label>
      <ToggleGroup
        aria-describedby="reminder-help"
        multiple
        onValueChange={(selected) => onChange(selected.map(Number))}
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
      <p className="text-muted-foreground text-xs" id="reminder-help">
        Select when to send reminders before the event starts
      </p>
    </div>
  );
}
