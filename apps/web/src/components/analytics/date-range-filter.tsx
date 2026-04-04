import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Calendar } from "@pi-dash/design-system/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@pi-dash/design-system/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import { format, isValid, parseISO } from "date-fns";
import { useQueryStates } from "nuqs";
import { useState } from "react";
import { ISO_DATE } from "@/lib/date-formats";
import { DATE_PRESETS, dateRangeSearchParams } from "@/lib/date-range";

interface RangeSelection {
  from: Date | undefined;
  to?: Date | undefined;
}

function parseUrlDate(str: string): Date | undefined {
  if (!str) {
    return undefined;
  }
  const d = parseISO(str);
  return isValid(d) ? d : undefined;
}

function formatRangeLabel(fromStr: string, toStr: string, includeYear = false) {
  const from = parseUrlDate(fromStr);
  const to = parseUrlDate(toStr);
  if (!(from && to)) {
    return null;
  }
  const toFormat = includeYear ? "MMM d, yyyy" : "MMM d";
  return `${format(from, "MMM d")} \u2013 ${format(to, toFormat)}`;
}

export function DateRangeFilter() {
  const [params, setParams] = useQueryStates(dateRangeSearchParams);
  const [customRange, setCustomRange] = useState<RangeSelection | undefined>(
    () => {
      if (params.range !== "custom") {
        return undefined;
      }
      const from = parseUrlDate(params.from);
      const to = parseUrlDate(params.to);
      if (from) {
        return { from, to };
      }
      return undefined;
    }
  );

  function handlePresetChange(value: string | null) {
    if (!value) {
      return;
    }
    if (value === "custom") {
      setParams({ range: "custom", from: params.from, to: params.to });
      return;
    }
    setParams({ range: value, from: "", to: "" });
  }

  function handleCustomRangeSelect(range: RangeSelection | undefined) {
    setCustomRange(range);
    if (range?.from && range?.to) {
      setParams({
        range: "custom",
        from: format(range.from, ISO_DATE),
        to: format(range.to, ISO_DATE),
      });
    }
  }

  const activePreset = DATE_PRESETS.find((p) => p.key === params.range);
  const isCustom = params.range === "custom";

  function getDisplayLabel() {
    if (isCustom) {
      return formatRangeLabel(params.from, params.to, true) ?? "Custom range";
    }
    return activePreset?.label ?? "All time";
  }

  const displayLabel = getDisplayLabel();

  return (
    <div className="flex items-center gap-2">
      <Select onValueChange={handlePresetChange} value={params.range}>
        <SelectTrigger className="w-auto gap-1.5">
          <HugeiconsIcon
            className="size-3.5 text-muted-foreground"
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
        <Popover>
          <PopoverTrigger
            render={
              <Button size="sm" variant="outline">
                {formatRangeLabel(params.from, params.to) ?? "Pick dates"}
              </Button>
            }
          />
          <PopoverContent align="end" className="w-auto p-0">
            <Calendar
              mode="range"
              onSelect={handleCustomRangeSelect}
              selected={customRange}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
