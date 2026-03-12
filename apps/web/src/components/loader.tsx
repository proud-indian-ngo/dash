import { BrailleSpinner } from "@pi-dash/design-system/components/braille-spinner";

export function Loader() {
  return (
    <div className="flex h-full items-center justify-center pt-8">
      <BrailleSpinner />
    </div>
  );
}
