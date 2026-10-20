import { log } from "evlog";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
  TextLayer,
  version,
} from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";

import { Loader } from "@/components/loader";

import styles from "./pdf-pages.module.css";

GlobalWorkerOptions.workerSrc = workerSrc;

// Served by lib/dev/pdfjs-assets.ts, versioned so a tab from an earlier
// deploy never pairs its worker with another version's data.
const PDFJS_ASSETS_PATH = `/pdfjs/${version}/`;
// Pages never grow past a comfortable reading width on wide screens.
const MAX_PAGE_WIDTH = 960;
// Sharper than 2x costs memory without a visible gain.
const MAX_OUTPUT_SCALE = 2;
// One canvas stays under iOS Safari's per-canvas limit at any zoom.
const MAX_CANVAS_PIXELS = 16_777_216;

export type PdfProblem = "broken" | "password";

interface PageSize {
  height: number;
  width: number;
}

const isCancellation = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === "RenderingCancelledException" ||
    error.name === "AbortException");

function PdfPage({
  document,
  pageNumber,
  root,
  size,
  width,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  root: Element | null;
  size: PageSize;
  width: number;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const height = Math.floor((width * size.height) / size.width);

  // Draw pages within a screen of view; release the rest, so a long deed
  // never holds every page's pixels at once.
  useEffect(() => {
    const element = pageRef.current;
    if (!element) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry?.isIntersecting ?? false),
      { root, rootMargin: "100% 0px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const text = textRef.current;
    if (!(canvas && text)) {
      return;
    }
    if (!(near && width > 0)) {
      canvas.width = 0;
      canvas.height = 0;
      text.replaceChildren();
      return;
    }
    let cancelled = false;
    let renderTask: null | RenderTask = null;
    let textLayer: null | TextLayer = null;
    const report = (error: unknown) => {
      if (cancelled || isCancellation(error)) {
        return;
      }
      log.error({
        action: "renderPdfPage",
        component: "PdfPages",
        message: error instanceof Error ? error.message : String(error),
        pageNumber,
      });
    };
    document
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) {
          return;
        }
        const viewport = page.getViewport({ scale: width / size.width });
        const outputScale = Math.min(
          window.devicePixelRatio,
          MAX_OUTPUT_SCALE,
          Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height))
        );
        const drawn = page.getViewport({
          scale: viewport.scale * outputScale,
        });
        canvas.width = Math.floor(drawn.width);
        canvas.height = Math.floor(drawn.height);
        renderTask = page.render({ canvas, viewport: drawn });
        renderTask.promise.catch(report);

        text.replaceChildren();
        text.style.setProperty("--total-scale-factor", String(viewport.scale));
        textLayer = new TextLayer({
          container: text,
          textContentSource: page.streamTextContent(),
          viewport,
        });
        textLayer.render().catch(report);
      })
      .catch(report);
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [document, near, pageNumber, size.width, width]);

  return (
    <div
      aria-label={`Page ${pageNumber}`}
      className="relative shrink-0 bg-white shadow-sm ring-1 ring-black/5"
      ref={pageRef}
      role="group"
      style={{ height, width }}
    >
      <canvas
        aria-hidden
        className="absolute inset-0 size-full"
        ref={canvasRef}
      />
      <div className={styles.textLayer} ref={textRef} />
    </div>
  );
}

/**
 * Draws a PDF page by page, fitted to the scroll area's width times `zoom`.
 * It lives inside an element marked `data-preview-scroll`, which it observes
 * to draw pages as they come near.
 */
export default function PdfPages({
  data,
  onError,
  onLoad,
  zoom,
}: {
  data: Blob;
  onError: (problem: PdfProblem) => void;
  onLoad: (pageCount: number) => void;
  zoom: number;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<null | PDFDocumentProxy>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [fitWidth, setFitWidth] = useState(0);
  const [root, setRoot] = useState<Element | null>(null);

  useEffect(() => {
    const element = measureRef.current;
    if (!element) {
      return;
    }
    setRoot(element.closest("[data-preview-scroll]"));
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setFitWidth(
          Math.min(Math.floor(entry.contentRect.width), MAX_PAGE_WIDTH)
        );
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let task: null | PDFDocumentLoadingTask = null;
    data
      .arrayBuffer()
      .then((buffer) => {
        if (cancelled) {
          return null;
        }
        task = getDocument({
          cMapUrl: `${PDFJS_ASSETS_PATH}cmaps/`,
          data: new Uint8Array(buffer),
          iccUrl: `${PDFJS_ASSETS_PATH}iccs/`,
          standardFontDataUrl: `${PDFJS_ASSETS_PATH}standard_fonts/`,
          wasmUrl: `${PDFJS_ASSETS_PATH}wasm/`,
        });
        return task.promise;
      })
      .then(async (loaded) => {
        if (!loaded || cancelled) {
          return;
        }
        // Every page's shape up front, so placeholders hold their place and
        // landscape pages don't shift the scroll as they draw.
        const shapes = await Promise.all(
          Array.from({ length: loaded.numPages }, (_, index) =>
            loaded.getPage(index + 1).then((page) => {
              const { height, width } = page.getViewport({ scale: 1 });
              return { height, width };
            })
          )
        );
        if (cancelled) {
          return;
        }
        setSizes(shapes);
        setDocument(loaded);
        onLoad(loaded.numPages);
      })
      .catch((error: unknown) => {
        if (cancelled || isCancellation(error)) {
          return;
        }
        if (error instanceof Error && error.name === "PasswordException") {
          onError("password");
          return;
        }
        log.error({
          action: "loadPdf",
          component: "PdfPages",
          message: error instanceof Error ? error.message : String(error),
        });
        onError("broken");
      });
    return () => {
      cancelled = true;
      task?.destroy();
    };
  }, [data, onError, onLoad]);

  const width = Math.floor(fitWidth * zoom);

  return (
    <div ref={measureRef}>
      {document ? (
        // As wide as the widest page, so a zoomed page scrolls sideways.
        <div className="flex w-max min-w-full flex-col items-center gap-4">
          {sizes.map((size, index) => (
            <PdfPage
              document={document}
              key={index}
              pageNumber={index + 1}
              root={root}
              size={size}
              width={width}
            />
          ))}
        </div>
      ) : (
        <Loader />
      )}
    </div>
  );
}
