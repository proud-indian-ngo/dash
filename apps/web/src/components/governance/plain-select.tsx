import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@pi-dash/design-system/components/ui/select";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";

export interface PlainSelectOption {
  label: string;
  value: string;
}

/**
 * The design-system select outside a form: a value, its options and a
 * change handler. Empty strings are valid values ("none").
 */
export function PlainSelect({
  className,
  id,
  label,
  onChange,
  options,
  value,
}: {
  className?: string;
  id?: string;
  /** Accessible name when no visible label points at `id`. */
  label?: string;
  onChange: (value: string) => void;
  options: PlainSelectOption[];
  value: string;
}) {
  const handleValueChange = useEventCallback(
    (next: string | null, details: { cancel: () => void }) => {
      if (next === null) {
        details.cancel();
        return;
      }
      onChange(next);
    }
  );
  const selected = options.find((o) => o.value === value)?.label ?? "";
  return (
    <Select onValueChange={handleValueChange} value={value}>
      <SelectTrigger
        aria-label={label}
        className={cn("w-full", className)}
        id={id}
      >
        <span
          className="flex flex-1 items-center truncate text-left"
          data-slot="select-value"
        >
          {selected}
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
