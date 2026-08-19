import type * as React from "react"

import { cn } from "@pi-dash/design-system/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

function Spinner({ className }: React.ComponentProps<"svg">) {
  return (
    <HugeiconsIcon
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      data-slot="spinner"
      icon={Loading03Icon}
      role="status"
      strokeWidth={2}
    />
  )
}

export { Spinner }
