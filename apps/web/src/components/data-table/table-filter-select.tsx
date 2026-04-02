import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@pi-dash/design-system/components/ui/combobox";
import { InputGroupAddon } from "@pi-dash/design-system/components/ui/input-group";

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
  const selectedLabel = value
    ? (options.find((o) => o.value === value)?.label ?? value)
    : "All";

  return (
    <Combobox
      itemToStringLabel={(v) => {
        if (v === "__all__") {
          return "All";
        }
        return options.find((o) => o.value === v)?.label ?? String(v);
      }}
      onValueChange={(v) => onChange(v === "__all__" || !v ? "" : v)}
      value={value || "__all__"}
    >
      <ComboboxInput
        aria-label={label}
        className="h-8 w-auto text-xs"
        placeholder="All"
        size={selectedLabel.length || 3}
      >
        <InputGroupAddon align="inline-start">
          <span className="whitespace-nowrap text-muted-foreground">
            {label}:
          </span>
        </InputGroupAddon>
      </ComboboxInput>
      <ComboboxContent className="w-max min-w-[var(--anchor-width)]">
        <ComboboxList>
          <ComboboxEmpty>No matches.</ComboboxEmpty>
          <ComboboxItem value="__all__">All</ComboboxItem>
          {options.map((option) => (
            <ComboboxItem key={option.value} value={option.value}>
              {option.label}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
