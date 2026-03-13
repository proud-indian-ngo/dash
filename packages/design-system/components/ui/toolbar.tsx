"use client"

import * as React from "react"

import { Toolbar as ToolbarPrimitive } from "@base-ui/react/toolbar"
import { type VariantProps, cva } from "class-variance-authority"

import { Separator } from "@pi-dash/design-system/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@pi-dash/design-system/components/ui/tooltip"
import { cn } from "@pi-dash/design-system/lib/utils"

export function Toolbar({
  className,
  orientation = "horizontal",
  ...props
}: ToolbarPrimitive.Root.Props) {
  return (
    <ToolbarPrimitive.Root
      className={cn("relative flex select-none items-center", className)}
      data-slot="toolbar-root"
      orientation={orientation}
      {...props}
    />
  )
}

export function ToolbarSeparator({
  className,
  ...props
}: ToolbarPrimitive.Separator.Props) {
  return (
    <ToolbarPrimitive.Separator
      className={cn("mx-2 my-1 w-px shrink-0 bg-border", className)}
      data-slot="toolbar-separator"
      {...props}
    />
  )
}

const toolbarButtonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-[color,box-shadow] hover:bg-muted hover:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[pressed]:bg-accent data-[pressed]:text-accent-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-9 min-w-9 px-2",
        lg: "h-10 min-w-10 px-2.5",
        sm: "h-8 min-w-8 px-1.5",
      },
      variant: {
        default: "bg-transparent",
        outline:
          "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground",
      },
    },
  }
)

type ToolbarButtonProps = {
  pressed?: boolean
} & ToolbarPrimitive.Button.Props &
  VariantProps<typeof toolbarButtonVariants>

export const ToolbarButton = withTooltip(function ToolbarButton({
  children,
  className,
  pressed,
  size = "sm",
  variant,
  ...props
}: ToolbarButtonProps) {
  return (
    <ToolbarPrimitive.Button
      className={cn(toolbarButtonVariants({ size, variant }), className)}
      data-pressed={pressed ? "" : undefined}
      {...props}
    >
      {children}
    </ToolbarPrimitive.Button>
  )
})

export function ToolbarGroup({
  children,
  className,
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "group/toolbar-group",
        "relative hidden has-[button]:flex",
        className
      )}
    >
      <div className="flex items-center">{children}</div>

      <div className="group-last/toolbar-group:hidden! mx-1.5 py-0.5">
        <Separator orientation="vertical" />
      </div>
    </div>
  )
}

type TooltipProps<T extends React.ElementType> = {
  tooltip?: React.ReactNode
  tooltipContentProps?: Omit<
    React.ComponentPropsWithoutRef<typeof TooltipContent>,
    "children"
  >
  tooltipTriggerProps?: React.ComponentPropsWithoutRef<typeof TooltipTrigger>
} & React.ComponentProps<T>

function withTooltip<T extends React.ElementType>(Component: T) {
  return function ExtendComponent({
    tooltip,
    tooltipContentProps,
    tooltipTriggerProps,
    ...props
  }: TooltipProps<T>) {
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
      setMounted(true)
    }, [])

    const component = <Component {...(props as React.ComponentProps<T>)} />

    if (tooltip && mounted) {
      return (
        <Tooltip>
          <TooltipTrigger render={component} {...tooltipTriggerProps} />

          <TooltipContent {...tooltipContentProps}>{tooltip}</TooltipContent>
        </Tooltip>
      )
    }

    return component
  }
}
