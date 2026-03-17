import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@pi-dash/design-system/components/ui/select";

interface TableFilterSelectProps {
  label: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  value: string;
}

export function TableFilterSelect({
  label,
  onChange,
  options,
  value,
}: TableFilterSelectProps) {
  return (
    <Select
      onValueChange={(v) => onChange(v === "__all__" || !v ? "" : v)}
      value={value || "__all__"}
    >
      <SelectTrigger aria-label={label} className="h-8 w-auto min-w-28 text-xs">
        <span className="flex items-center gap-1.5" data-slot="select-value">
          <span className="text-muted-foreground">{label}:</span>
          <span>
            {value
              ? (options.find((o) => o.value === value)?.label ?? value)
              : "All"}
          </span>
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">All</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
