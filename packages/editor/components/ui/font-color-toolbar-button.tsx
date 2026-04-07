"use client";

import { cn } from "@pi-dash/design-system/lib/utils";

export const DEFAULT_COLORS = [
  "#000000",
  "#434343",
  "#666666",
  "#999999",
  "#b7b7b7",
  "#cccccc",
  "#d9d9d9",
  "#ffffff",
  "#ff0000",
  "#ff9900",
  "#ffff00",
  "#00ff00",
  "#00ffff",
  "#4a86e8",
  "#0000ff",
  "#9900ff",
  "#ff00ff",
  "#ea4335",
  "#fbbc04",
  "#34a853",
  "#4285f4",
  "#ff6d00",
  "#46bdc6",
  "#7986cb",
];

export function ColorDropdownMenuItems({
  colors = DEFAULT_COLORS,
  updateColor,
  className,
}: {
  colors?: string[];
  updateColor: (color: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {colors.map((color) => (
        <button
          className="size-5 rounded-sm border border-border focus:outline-none focus:ring-1 focus:ring-ring"
          key={color}
          onClick={() => updateColor(color)}
          style={{ backgroundColor: color }}
          title={color}
          type="button"
        />
      ))}
    </div>
  );
}
