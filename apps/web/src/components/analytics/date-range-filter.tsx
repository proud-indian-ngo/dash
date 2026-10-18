import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Calendar } from "@pi-dash/design-system/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { format, isValid, parseISO } from "date-fns";
import { useQueryStates } from "nuqs";
import { useState } from "react";

import { ResponsivePicker } from "@/components/shared/responsive-picker";
import { DATE, DAY_MONTH, ISO_DATE } from "@/lib/date-formats";
import { DATE_PRESETS, dateRangeSearchParams } from "@/lib/date-range";

interface RangeSelection {
  from: Date | undefined;
  to?: Date | undefined;
}

function parseUrlDate(str: string): Date | undefined {
  if (!str) {
    return;
  }
  const d = parseISO(str);
  return isValid(d) ? d : undefined;
}

function formatRangeLabel(fromStr: string, toStr: string) {
  const from = parseUrlDate(fromStr);
  const to = parseUrlDate(toStr);
  if (!(from && to)) {
    return null;
  }
  return `${format(from, DAY_MONTH)} \u2013 ${format(to, DATE)}`;
}

export function DateRangeFilter({ onChange }: { onChange?: () => void } = {}) {
  const [params, setParams] = useQueryStates(dateRangeSearchParams);
  const [customRange, setCustomRange] = useState<RangeSelection | undefined>(
    () => {
      if (params.range !== "custom") {
        return;
      }
      const from = parseUrlDate(params.from);
      const to = parseUrlDate(params.to);
      if (from) {
        return { from, to };
      }
    }
  );

  const [pickerOpen, setPickerOpen] = useState(false);

  const handlePresetChange = useEventCallback((value: string | null) => {
    if (!value) {
      return;
    }
    onChange?.();
    if (value === "custom") {
      setParams({ from: params.from, range: "custom", to: params.to });
      setPickerOpen(true);
      return;
    }
    setParams({ from: "", range: value, to: "" });
  });

  const handleCustomRangeSelect = useEventCallback(
    (range: RangeSelection | undefined) => {
      setCustomRange(range);
      if (range?.from && range?.to) {
        onChange?.();
        setParams({
          from: format(range.from, ISO_DATE),
          range: "custom",
          to: format(range.to, ISO_DATE),
        });
      }
    }
  );

  const activePreset = DATE_PRESETS.find((p) => p.key === params.range);
  const isCustom = params.range === "custom";

  // The dates show once, on the picker button beside the select.
  const displayLabel = isCustom
    ? "Custom range"
    : (activePreset?.label ?? "All time");

  return (
    <div className="flex items-center gap-2">
      <Select onValueChange={handlePresetChange} value={params.range}>
        <SelectTrigger className="w-auto gap-1.5 data-[size=default]:h-8">
          <HugeiconsIcon
            className="text-muted-foreground size-3.5"
            icon={Calendar03Icon}
            strokeWidth={2}
          />
          <SelectValue>{displayLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {DATE_PRESETS.map((preset) => (
            <SelectItem key={preset.key} value={preset.key}>
              {preset.label}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>

      {isCustom && (
        <ResponsivePicker
          onOpenChange={setPickerOpen}
          open={pickerOpen}
          title="Custom range"
          trigger={
            <Button size="sm" variant="outline">
              {formatRangeLabel(params.from, params.to) ?? "Pick dates"}
            </Button>
          }
        >
          <Calendar
            mode="range"
            onSelect={handleCustomRangeSelect}
            selected={customRange}
          />
        </ResponsivePicker>
      )}
    </div>
  );
}
