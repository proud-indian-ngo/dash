import {
  Cancel01Icon,
  Download04Icon,
  LinkSquare02Icon,
  MinusSignIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { log } from "evlog";
import {
  type KeyboardEvent,
  lazy,
  type MouseEvent,
  type ReactNode,
  Suspense,
  useEffect,
  useState,
} from "react";

import { Loader } from "@/components/loader";
import {
  contentDispositionFilename,
  previewFailureMessage,
  previewKind,
  type PreviewKind,
} from "@/lib/file-preview";

import type { PdfProblem } from "./pdf-pages";

const PdfPages = lazy(() => import("./pdf-pages"));

// Fit width is 1; the rest are steps either side of it.
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;
// Long enough for Safari and Firefox to start the download first.
const OBJECT_URL_LIFETIME_MS = 60_000;

type Preview =
  | { status: "failed"; httpStatus: null | number }
  | { status: "loading" }
  | { blob: Blob; filename: string; kind: PreviewKind; status: "ready" };

// React carries events from the portal to the trigger's ancestors, such as a
// table row that opens its own sheet on click or Enter.
const stopPropagation = (event: KeyboardEvent | MouseEvent) =>
  event.stopPropagation();

const saveBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
};

function ImagePreview({
  blob,
  fileName,
  onError,
}: {
  blob: Blob;
  fileName: string;
  onError: () => void;
}) {
  const [url, setUrl] = useState<null | string>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url ? (
    // HEIC shows only in Safari; elsewhere onError explains instead.
    <img
      alt={fileName}
      className="mx-auto h-auto max-w-full bg-white shadow-sm ring-1 ring-black/5"
      onError={onError}
      src={url}
    />
  ) : null;
}

function PreviewMessage({
  action,
  children,
}: {
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-muted-foreground text-sm">{children}</p>
      {action}
    </div>
  );
}

function ZoomControls({
  onChange,
  zoom,
}: {
  onChange: (zoom: number) => void;
  zoom: number;
}) {
  const index = ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]);
  return (
    <div className="bg-popover ring-foreground/10 absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full p-1 shadow-md ring-1 max-sm:bottom-[max(1rem,env(safe-area-inset-bottom))]">
      <Button
        aria-label="Zoom out"
        disabled={index <= 0}
        onClick={() => onChange(ZOOM_STEPS[index - 1] ?? zoom)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon
          className="size-4"
          icon={MinusSignIcon}
          strokeWidth={2}
        />
      </Button>
      <Button
        aria-label="Fit to width"
        className="min-w-14 tabular-nums"
        onClick={() => onChange(1)}
        size="sm"
        title="Fit to width"
        type="button"
        variant="ghost"
      >
        {Math.round(zoom * 100)}%
      </Button>
      <Button
        aria-label="Zoom in"
        disabled={index >= ZOOM_STEPS.length - 1}
        onClick={() => onChange(ZOOM_STEPS[index + 1] ?? zoom)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon className="size-4" icon={PlusSignIcon} strokeWidth={2} />
      </Button>
    </div>
  );
}

function FilePreviewContent({
  aside,
  fileName,
  mimeType,
  src,
}: {
  aside?: ReactNode;
  fileName: string;
  mimeType?: null | string;
  src: string;
}) {
  // A type the caller knows isn't viewable is offered as a download, unfetched.
  const skip = mimeType ? previewKind(mimeType) === "other" : false;
  const [preview, setPreview] = useState<Preview>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [pageCount, setPageCount] = useState<null | number>(null);
  const [pdfProblem, setPdfProblem] = useState<null | PdfProblem>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (skip) {
      return;
    }
    const controller = new AbortController();
    setPreview({ status: "loading" });
    fetch(src, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setPreview({ httpStatus: response.status, status: "failed" });
          return;
        }
        const blob = await response.blob();
        setPreview({
          blob,
          filename:
            contentDispositionFilename(
              response.headers.get("content-disposition")
            ) ?? fileName,
          kind: previewKind(blob.type),
          status: "ready",
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        log.error({
          action: "loadPreview",
          component: "FilePreview",
          message: error instanceof Error ? error.message : String(error),
        });
        setPreview({ httpStatus: null, status: "failed" });
      });
    return () => controller.abort();
  }, [attempt, fileName, skip, src]);

  const handlePdfError = useEventCallback((problem: PdfProblem) => {
    setPdfProblem(problem);
  });
  const handlePdfLoad = useEventCallback((count: number) => {
    setPageCount(count);
  });
  const handleImageError = useEventCallback(() => setImageFailed(true));
  const handleRetry = useEventCallback(() => setAttempt((count) => count + 1));
  const handleDownload = useEventCallback(() => {
    if (preview.status === "ready") {
      saveBlob(preview.blob, preview.filename);
    }
  });

  const showsPdf =
    !skip &&
    preview.status === "ready" &&
    preview.kind === "pdf" &&
    pdfProblem === null;

  let body: ReactNode;
  if (skip) {
    body = (
      <PreviewMessage>
        This type of file can't be previewed. Download it to open it.
      </PreviewMessage>
    );
  } else if (preview.status === "loading") {
    body = <Loader />;
  } else if (preview.status === "failed") {
    body = (
      <PreviewMessage
        action={
          <Button
            onClick={handleRetry}
            size="sm"
            type="button"
            variant="outline"
          >
            Retry
          </Button>
        }
      >
        {previewFailureMessage(preview.httpStatus)}
      </PreviewMessage>
    );
  } else if (preview.kind === "pdf" && pdfProblem === "password") {
    body = (
      <PreviewMessage>
        This PDF is password protected. Download it to open it.
      </PreviewMessage>
    );
  } else if (preview.kind === "pdf" && pdfProblem === "broken") {
    body = (
      <PreviewMessage>
        This PDF couldn't be shown. Download it to open it.
      </PreviewMessage>
    );
  } else if (preview.kind === "pdf") {
    body = (
      <Suspense fallback={<Loader />}>
        <PdfPages
          data={preview.blob}
          onError={handlePdfError}
          onLoad={handlePdfLoad}
          zoom={zoom}
        />
      </Suspense>
    );
  } else if (preview.kind === "image" && !imageFailed) {
    body = (
      <ImagePreview
        blob={preview.blob}
        fileName={fileName}
        onError={handleImageError}
      />
    );
  } else {
    body = (
      <PreviewMessage>
        This type of file can't be previewed. Download it to open it.
      </PreviewMessage>
    );
  }

  return (
    <>
      <DialogHeader className="min-w-0 flex-row items-center gap-2 pr-3 max-sm:pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <DialogTitle className="truncate">{fileName}</DialogTitle>
          <DialogDescription
            className={pageCount === null ? "sr-only" : "text-xs"}
          >
            {pageCount === null
              ? "Preview of the file"
              : `${pageCount} ${pageCount === 1 ? "page" : "pages"}`}
          </DialogDescription>
        </div>
        {skip ? (
          // Unfetched: the browser saves it under the server's file name.
          <Button
            render={<a download href={src} />}
            size="sm"
            variant="outline"
          >
            <HugeiconsIcon
              className="size-4"
              icon={Download04Icon}
              strokeWidth={2}
            />
            Download
          </Button>
        ) : (
          <Button
            disabled={preview.status !== "ready"}
            onClick={handleDownload}
            size="sm"
            type="button"
            variant="outline"
          >
            <HugeiconsIcon
              className="size-4"
              icon={Download04Icon}
              strokeWidth={2}
            />
            Download
          </Button>
        )}
        <Button
          aria-label="Open in new tab"
          render={<a href={src} rel="noopener noreferrer" target="_blank" />}
          size="icon-sm"
          title="Open in new tab"
          variant="ghost"
        >
          <HugeiconsIcon
            className="size-4"
            icon={LinkSquare02Icon}
            strokeWidth={2}
          />
        </Button>
        <DialogClose
          render={<Button aria-label="Close" size="icon-sm" variant="ghost" />}
        >
          <HugeiconsIcon
            className="size-4"
            icon={Cancel01Icon}
            strokeWidth={2}
          />
        </DialogClose>
      </DialogHeader>
      {aside ? (
        // The file beside what it is checked against: side by side on wider
        // screens, the details under the pages on phones.
        <div className="-mx-5 -mb-5 grid min-h-0 grid-rows-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_20rem] sm:grid-rows-1">
          <div
            className="min-h-0 overflow-auto overscroll-contain px-3 pb-20 sm:px-5"
            data-preview-scroll
          >
            {body}
          </div>
          <aside className="bg-background max-h-[45dvh] overflow-auto border-t p-4 sm:max-h-none sm:border-t-0 sm:border-l">
            {aside}
          </aside>
        </div>
      ) : (
        <div
          className="-mx-5 -mb-5 min-h-0 overflow-auto overscroll-contain px-3 pb-20 sm:px-5"
          data-preview-scroll
        >
          {body}
        </div>
      )}
      {showsPdf && pageCount !== null ? (
        <ZoomControls onChange={setZoom} zoom={zoom} />
      ) : null}
    </>
  );
}

interface FilePreviewProps {
  /** Names the dialog and the download when the response names none. */
  fileName: string;
  /** The stored type, when the caller has it: other types skip the fetch. */
  mimeType?: null | string;
  /** The file's inline URL. */
  src: string;
}

/**
 * Shows a PDF or image in the dashboard. It fetches the file once and
 * Download saves that copy.
 */
export function FilePreviewDialog({
  aside,
  fileName,
  mimeType,
  onOpenChange,
  open,
  src,
}: FilePreviewProps & {
  /** Shown beside the file, such as the record it is checked against. */
  aside?: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <span
      className="contents"
      onClick={stopPropagation}
      onKeyDown={stopPropagation}
      role="presentation"
    >
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent
          // Full screen on phones: pages scroll, so a drawer swipe would
          // fight them. The body holds the header above one scroll area.
          className="bg-muted *:data-[slot=dialog-body]:grid-rows-[auto_minmax(0,1fr)] *:data-[slot=dialog-body]:overflow-hidden max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:h-[calc(100dvh-4rem)] sm:max-w-[min(64rem,calc(100%-4rem))]"
          data-plain
          showCloseButton={false}
        >
          <FilePreviewContent
            aside={aside}
            fileName={fileName}
            mimeType={mimeType}
            src={src}
          />
        </DialogContent>
      </Dialog>
    </span>
  );
}

/** A button that opens the file preview, styled by the caller. */
export function FilePreviewButton({
  children,
  className,
  fileName,
  mimeType,
  src,
  ...props
}: FilePreviewProps & {
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  const [open, setOpen] = useState(false);
  const handleOpen = useEventCallback((event: MouseEvent) => {
    event.stopPropagation();
    setOpen(true);
  });
  return (
    <>
      <button
        aria-haspopup="dialog"
        className={className}
        onClick={handleOpen}
        onKeyDown={stopPropagation}
        type="button"
        {...props}
      >
        {children}
      </button>
      <FilePreviewDialog
        fileName={fileName}
        mimeType={mimeType}
        onOpenChange={setOpen}
        open={open}
        src={src}
      />
    </>
  );
}
