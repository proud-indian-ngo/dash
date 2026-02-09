"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, Globe02Icon } from "@hugeicons/core-free-icons"
import * as RPNInput from "react-phone-number-input"
import flags from "react-phone-number-input/flags"

import { cn } from "@pi-dash/design-system/lib/utils"
import { Button } from "@pi-dash/design-system/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@pi-dash/design-system/components/ui/command"
import { Input } from "@pi-dash/design-system/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@pi-dash/design-system/components/ui/popover"

type PhoneInputProps = Omit<
  React.ComponentProps<typeof RPNInput.default>,
  "onChange" | "value"
> & {
  onChange?: (value: string) => void
  value?: string
}

type CountrySelectOption = {
  divider?: boolean
  label: string
  value?: RPNInput.Country
}

type CountrySelectProps = {
  disabled?: boolean
  onChange: (value?: RPNInput.Country) => void
  options: CountrySelectOption[]
  readOnly?: boolean
  value?: RPNInput.Country
}

function PhoneInput({ className, onChange, ...props }: PhoneInputProps) {
  return (
    <RPNInput.default
      className={cn("flex", className)}
      countrySelectComponent={CountrySelect}
      flagComponent={Flag}
      inputComponent={InputComponent}
      onChange={(value) => onChange?.(value ?? "")}
      smartCaret={false}
      {...props}
    />
  )
}

const InputComponent = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <Input
      className={cn("rounded-l-none border-l-0", className)}
      ref={ref}
      {...props}
    />
  )
)

InputComponent.displayName = "PhoneInputValue"

function CountrySelect({
  disabled,
  onChange,
  options,
  readOnly,
  value,
}: CountrySelectProps) {
  const [open, setOpen] = React.useState(false)

  const availableOptions = options.filter((option) => {
    return !option.divider && Boolean(option.value)
  })
  const selectedOption = availableOptions.find((option) => option.value === value)
  const isDisabled = Boolean(disabled || readOnly)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            aria-label="Select country"
            className="rounded-r-none border-r-0 px-2.5"
            disabled={isDisabled}
            type="button"
            variant="outline"
          >
            {value ? (
              <Flag country={value} countryName={selectedOption?.label ?? value} />
            ) : (
                <HugeiconsIcon icon={Globe02Icon} strokeWidth={2} className="size-4 opacity-60" />
            )}
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-4 opacity-60" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Search country..." />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {availableOptions.map((option) => {
                const country = option.value
                if (!country) {
                  return null
                }

                const isSelected = country === value
                return (
                  <CommandItem
                    data-checked={isSelected}
                    key={country}
                    onSelect={() => {
                      onChange(country)
                      setOpen(false)
                    }}
                    value={`${option.label} ${country} +${RPNInput.getCountryCallingCode(country)}`}
                  >
                    <Flag country={country} countryName={option.label} />
                    <span className="flex-1 truncate">{option.label}</span>
                    <span className="text-muted-foreground">+{RPNInput.getCountryCallingCode(country)}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function Flag({
  country,
  countryName,
}: {
  country: RPNInput.Country
  countryName: string
}) {
  const FlagIcon = flags[country]

  return (
    <span className="bg-muted/50 flex h-4 w-6 shrink-0 items-center justify-center overflow-hidden rounded-xs">
      {FlagIcon ? <FlagIcon title={countryName} /> : <HugeiconsIcon icon={Globe02Icon} strokeWidth={2} className="size-3.5" />}
    </span>
  )
}

export { PhoneInput }
