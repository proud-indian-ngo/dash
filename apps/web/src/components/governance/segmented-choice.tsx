import {
  ToggleGroup,
  ToggleGroupItem,
} from "@pi-dash/design-system/components/ui/toggle-group";

/**
 * One tap per mark while the meeting runs: attendance and votes. Tapping the
 * chosen option again clears it, when `onChange` accepts null.
 */
export function SegmentedChoice<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T | null) => void;
  options: readonly { label: string; short?: string; value: T }[];
  value: T | null;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      className="overflow-hidden rounded-md"
      onValueChange={(next: string[]) => {
        const picked = options.find((o) => o.value === next[0]);
        onChange(picked ? picked.value : null);
      }}
      size="sm"
      value={value ? [value] : []}
      variant="outline"
    >
      {options.map((option) => (
        <ToggleGroupItem
          aria-label={option.label}
          className="aria-pressed:bg-sidebar-accent aria-pressed:text-sidebar-accent-foreground aria-pressed:hover:bg-sidebar-accent px-2.5 text-xs pointer-coarse:h-10 pointer-coarse:min-w-10"
          key={option.value}
          value={option.value}
        >
          {option.short ?? option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
