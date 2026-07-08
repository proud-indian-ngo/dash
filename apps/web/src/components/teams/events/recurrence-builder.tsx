import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@pi-dash/design-system/components/ui/select";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { expandSeries } from "@pi-dash/shared/rrule-expand";
import {
  buildExcludeRRule,
  excludeRuleLabel,
  formStateToRRule,
  type RRuleFormState,
  rruleToFormState,
} from "@pi-dash/zero/rrule-utils";
import { format } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { SHORT_MONTH_DATE_TIME } from "@/lib/date-formats";

const WEEKDAY_LABELS = [
  { label: "Mo", value: 0 },
  { label: "Tu", value: 1 },
  { label: "We", value: 2 },
  { label: "Th", value: 3 },
  { label: "Fr", value: 4 },
  { label: "Sa", value: 5 },
  { label: "Su", value: 6 },
];

const FREQUENCY_OPTIONS = [
  { label: "None (one-time)", value: "" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Yearly", value: "yearly" },
];

const END_TYPE_OPTIONS = [
  { label: "Never", value: "never" },
  { label: "After N occurrences", value: "count" },
  { label: "On date", value: "until" },
];

const POSITION_LABELS: Record<number, string> = {
  1: "First",
  2: "Second",
  3: "Third",
  4: "Fourth",
  [-1]: "Last",
};

const DEFAULT_STATE: RRuleFormState = {
  byDay: [],
  endType: "never",
  frequency: "weekly",
  interval: 1,
};

function getFrequencyUnit(freq: string): string {
  if (freq === "daily") {
    return "day(s)";
  }
  if (freq === "weekly") {
    return "week(s)";
  }
  if (freq === "monthly") {
    return "month(s)";
  }
  return "year(s)";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function IntervalInput({
  frequency,
  interval,
  onChange,
}: {
  frequency: string;
  interval: number;
  onChange: (interval: number) => void;
}) {
  const stableOnChange0 = useEventCallback((e: { target: { value: string } }) =>
    onChange(Number.parseInt(e.target.value, 10) || 1)
  );

  return (
    <div className="flex items-center gap-2">
      <Label className="shrink-0">Every</Label>
      <Input
        className="w-16"
        min={1}
        onChange={stableOnChange0}
        type="number"
        value={interval}
      />
      <span className="text-muted-foreground text-sm">
        {getFrequencyUnit(frequency)}
      </span>
    </div>
  );
}

function WeekdayPicker({
  byDay,
  onChange,
}: {
  byDay: number[];
  onChange: (byDay: number[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>On days</Label>
      <div className="flex gap-1">
        {WEEKDAY_LABELS.map((d) => {
          const isSelected = byDay.includes(d.value);
          return (
            <Button
              className="h-8 w-8 text-xs"
              key={d.value}
              onClick={() => {
                const next = isSelected
                  ? byDay.filter((v) => v !== d.value)
                  : [...byDay, d.value];
                onChange(next);
              }}
              size="icon"
              type="button"
              variant={isSelected ? "default" : "outline"}
            >
              {d.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function MonthlyPositionPicker({
  bySetPos,
  onChange,
}: {
  bySetPos: number | undefined;
  onChange: (bySetPos: number | undefined) => void;
}) {
  const stableOnValueChange1 = useEventCallback((v: string | null) =>
    onChange(v ? Number(v) : undefined)
  );

  return (
    <div className="space-y-1.5">
      <Label>Position in month</Label>
      <Select
        onValueChange={stableOnValueChange1}
        value={bySetPos?.toString() ?? ""}
      >
        <SelectTrigger>
          {bySetPos
            ? (POSITION_LABELS[bySetPos] ?? "Custom")
            : "Same date each month"}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">Same date each month</SelectItem>
          <SelectItem value="1">First</SelectItem>
          <SelectItem value="2">Second</SelectItem>
          <SelectItem value="3">Third</SelectItem>
          <SelectItem value="4">Fourth</SelectItem>
          <SelectItem value="-1">Last</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function EndConditionPicker({
  endType,
  count,
  until,
  onChange,
}: {
  count: number | undefined;
  endType: RRuleFormState["endType"];
  onChange: (patch: Partial<RRuleFormState>) => void;
  until: string | undefined;
}) {
  const stableOnValueChange2 = useEventCallback((v: string | null) =>
    onChange({ endType: (v ?? "never") as RRuleFormState["endType"] })
  );
  const stableOnChange3 = useEventCallback((e: { target: { value: string } }) =>
    onChange({ count: Number.parseInt(e.target.value, 10) || 1 })
  );
  const stableOnChange4 = useEventCallback((e: { target: { value: string } }) =>
    onChange({ until: e.target.value })
  );

  return (
    <div className="space-y-1.5">
      <Label>Ends</Label>
      <Select onValueChange={stableOnValueChange2} value={endType}>
        <SelectTrigger>
          {END_TYPE_OPTIONS.find((o) => o.value === endType)?.label}
        </SelectTrigger>
        <SelectContent>
          {END_TYPE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {endType === "count" ? (
        <div className="flex items-center gap-2">
          <Label className="shrink-0">After</Label>
          <Input
            className="w-20"
            min={1}
            onChange={stableOnChange3}
            type="number"
            value={count ?? 10}
          />
          <span className="text-muted-foreground text-sm">occurrences</span>
        </div>
      ) : null}

      {endType === "until" ? (
        <Input onChange={stableOnChange4} type="date" value={until ?? ""} />
      ) : null}
    </div>
  );
}

const EXCLUSION_POSITIONS = [
  { label: "1st", value: 1 },
  { label: "2nd", value: 2 },
  { label: "3rd", value: 3 },
  { label: "4th", value: 4 },
  { label: "Last", value: -1 },
];

const EXCLUSION_WEEKDAYS = [
  { label: "Monday", value: 0 },
  { label: "Tuesday", value: 1 },
  { label: "Wednesday", value: 2 },
  { label: "Thursday", value: 3 },
  { label: "Friday", value: 4 },
  { label: "Saturday", value: 5 },
  { label: "Sunday", value: 6 },
];

function ExclusionPicker({
  excludeRules,
  onChange,
}: {
  excludeRules: string[];
  onChange: (excludeRules: string[]) => void;
}) {
  const [nth, setNth] = useState(3);
  const [weekday, setWeekday] = useState(5); // Saturday

  const addExclusion = useEventCallback(() => {
    const rule = buildExcludeRRule(nth, weekday);
    if (!excludeRules.includes(rule)) {
      onChange([...excludeRules, rule]);
    }
  });

  const removeExclusion = (index: number) => {
    onChange(excludeRules.filter((_, i) => i !== index));
  };
  const stableOnValueChange5 = useEventCallback((v: string | null) =>
    setNth(Number(v))
  );
  const stableOnValueChange6 = useEventCallback((v: string | null) =>
    setWeekday(Number(v))
  );

  return (
    <div className="space-y-1.5">
      <Label>Skip on</Label>
      {excludeRules.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {excludeRules.map((rule, i) => (
            <Badge className="gap-1 pr-1" key={rule} variant="secondary">
              {excludeRuleLabel(rule)}
              <Button
                className="h-4 w-4 p-0"
                onClick={() => removeExclusion(i)}
                size="icon"
                type="button"
                variant="ghost"
              >
                ×
              </Button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <Select onValueChange={stableOnValueChange5} value={String(nth)}>
          <SelectTrigger className="w-20">
            {EXCLUSION_POSITIONS.find((p) => p.value === nth)?.label}
          </SelectTrigger>
          <SelectContent>
            {EXCLUSION_POSITIONS.map((p) => (
              <SelectItem key={p.value} value={String(p.value)}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select onValueChange={stableOnValueChange6} value={String(weekday)}>
          <SelectTrigger className="w-28">
            {EXCLUSION_WEEKDAYS.find((d) => d.value === weekday)?.label}
          </SelectTrigger>
          <SelectContent>
            {EXCLUSION_WEEKDAYS.map((d) => (
              <SelectItem key={d.value} value={String(d.value)}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={addExclusion}
          size="sm"
          type="button"
          variant="outline"
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function OccurrencePreview({
  excludeRules,
  frequency,
  startTime,
  state,
}: {
  excludeRules: string[];
  frequency: string;
  startTime: Date | undefined;
  state: RRuleFormState;
}) {
  if (!(frequency && startTime)) {
    return null;
  }

  let dates: { date: string; startTime: number }[] = [];
  try {
    const rrule = formStateToRRule(
      { ...state, frequency: frequency as RRuleFormState["frequency"] },
      startTime
    );
    const now = startTime.getTime();
    const farFuture = now + 365 * 24 * 60 * 60 * 1000;
    dates = expandSeries(
      { excludeRules: excludeRules.length ? excludeRules : undefined, rrule },
      now,
      null,
      now,
      farFuture
    ).slice(0, 5);
  } catch {
    // Invalid RRULE — no preview
  }

  if (dates.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground">
        Next {dates.length} occurrences
      </Label>
      <div className="flex flex-wrap gap-1">
        {dates.map((occ) => (
          <Badge key={occ.date} variant="secondary">
            {format(new Date(occ.startTime), SHORT_MONTH_DATE_TIME)}
          </Badge>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface RecurrenceBuilderProps {
  excludeRules?: string[];
  onChange: (rrule: string) => void;
  onExcludeRulesChange?: (excludeRules: string[]) => void;
  startTime?: Date;
  value: string;
}

export function RecurrenceBuilder({
  excludeRules: excludeRulesProp = [],
  value,
  onChange,
  onExcludeRulesChange,
  startTime,
}: RecurrenceBuilderProps) {
  const [state, setState] = useState<RRuleFormState>(() =>
    value ? rruleToFormState(value) : DEFAULT_STATE
  );
  const [frequency, setFrequency] = useState(value ? state.frequency : "");
  const [excludeRules, setExcludeRules] = useState<string[]>(excludeRulesProp);

  // Use ref to avoid onChange in effect deps (it's a new closure each render from TanStack Form)
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onExcludeRulesChangeRef = useRef(onExcludeRulesChange);
  onExcludeRulesChangeRef.current = onExcludeRulesChange;

  useEffect(() => {
    if (!frequency) {
      onChangeRef.current("");
      return;
    }
    const rrule = formStateToRRule(
      { ...state, frequency: frequency as RRuleFormState["frequency"] },
      startTime
    );
    onChangeRef.current(rrule);
  }, [state, frequency, startTime]);

  const handleExcludeRulesChange = useEventCallback((rules: string[]) => {
    setExcludeRules(rules);
    onExcludeRulesChangeRef.current?.(rules);
  });
  const stableOnValueChange7 = useEventCallback((v: string | null) => {
    setFrequency(v ?? "");
    if (v && !state.frequency) {
      setState(DEFAULT_STATE);
    }
    if (!v) {
      handleExcludeRulesChange([]);
    }
  });
  const stableOnChange8 = useEventCallback((interval: number) =>
    updateState({ interval })
  );
  const stableOnChange9 = useEventCallback((byDay: number[]) =>
    updateState({ byDay })
  );
  const stableOnChange10 = useEventCallback((bySetPos: number | undefined) =>
    updateState({ bySetPos })
  );
  const updateState = useEventCallback((patch: Partial<RRuleFormState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  });

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Recurrence</Label>
        <Select onValueChange={stableOnValueChange7} value={frequency}>
          <SelectTrigger>
            {FREQUENCY_OPTIONS.find((o) => o.value === frequency)?.label ??
              "None"}
          </SelectTrigger>
          <SelectContent>
            {FREQUENCY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {frequency ? (
        <>
          <IntervalInput
            frequency={frequency}
            interval={state.interval}
            onChange={stableOnChange8}
          />

          {frequency === "weekly" ? (
            <WeekdayPicker byDay={state.byDay} onChange={stableOnChange9} />
          ) : null}

          {frequency === "monthly" ? (
            <MonthlyPositionPicker
              bySetPos={state.bySetPos}
              onChange={stableOnChange10}
            />
          ) : null}

          <EndConditionPicker
            count={state.count}
            endType={state.endType}
            onChange={updateState}
            until={state.until}
          />

          <ExclusionPicker
            excludeRules={excludeRules}
            onChange={handleExcludeRulesChange}
          />

          <OccurrencePreview
            excludeRules={excludeRules}
            frequency={frequency}
            startTime={startTime}
            state={state}
          />
        </>
      ) : null}
    </div>
  );
}
