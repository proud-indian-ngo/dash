import { LoaderCircle } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function Loader() {
  return (
    <div className="flex h-full items-center justify-center pt-8">
      <HugeiconsIcon className="animate-spin" icon={LoaderCircle} />
    </div>
  );
}
