import { LoaderCircle } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function Loader() {
  return (
    <output
      aria-live="polite"
      className="flex h-full items-center justify-center pt-8"
    >
      <HugeiconsIcon
        aria-hidden="true"
        className="animate-spin"
        icon={LoaderCircle}
      />
      <span className="sr-only">Loading</span>
    </output>
  );
}
