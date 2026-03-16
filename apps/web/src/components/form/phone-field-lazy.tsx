import { lazy, Suspense } from "react";
import type { PhoneField as PhoneFieldType } from "./phone-field";

const PhoneFieldInner = lazy(() =>
  import("./phone-field").then((m) => ({ default: m.PhoneField }))
);

type PhoneFieldProps = Parameters<typeof PhoneFieldType>[0];

export function PhoneField(props: PhoneFieldProps) {
  return (
    <Suspense>
      <PhoneFieldInner {...props} />
    </Suspense>
  );
}
