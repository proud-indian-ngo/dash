import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@pi-dash/design-system/components/ui/combobox";
import { InputGroupAddon } from "@pi-dash/design-system/components/ui/input-group";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";

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
  const optionMap = new Map(
    options.map((option) => [option.value, option.label])
  );
  const items = ["__all__", ...options.map((option) => option.value)];
  const selectedLabel = value ? (optionMap.get(value) ?? value) : "All";
  const stableItemToStringLabel0 = useEventCallback((v: string | null) => {
    if (v === "__all__") {
      return "All";
    }
    return v ? (optionMap.get(v) ?? v) : "";
  });
  const stableOnValueChange1 = useEventCallback((v: string | null) =>
    onChange(v === "__all__" || !v ? "" : v)
  );

  return (
    <Combobox
      items={items}
      itemToStringLabel={stableItemToStringLabel0}
      onValueChange={stableOnValueChange1}
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
          {(itemValue) => (
            <ComboboxItem key={itemValue} value={itemValue}>
              {itemValue === "__all__"
                ? "All"
                : (optionMap.get(itemValue) ?? itemValue)}
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxEmpty>No matches.</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}
