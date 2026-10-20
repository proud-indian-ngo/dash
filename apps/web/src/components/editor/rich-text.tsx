import { lazy, Suspense } from "react";

import { RendererSkeleton } from "./editor-skeletons";

const RichTextRenderer = lazy(() =>
  import("@pi-dash/editor/rich-text-renderer").then((m) => ({
    default: m.RichTextRenderer,
  }))
);

/** Stored rich text (a resolution's body), read-only. */
export function RichText({
  className,
  content,
}: {
  className?: string;
  content: string;
}) {
  return (
    <Suspense fallback={<RendererSkeleton />}>
      <RichTextRenderer className={className} content={content} />
    </Suspense>
  );
}
