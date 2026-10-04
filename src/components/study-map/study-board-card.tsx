"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  DocumentTextIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import { useSignedUrl } from "@/components/editor/use-signed-url";
import {
  effectiveAssociations,
  type StudyMaterial,
  type StudyTopic,
} from "@/lib/study-map/types";

export interface StudyBoardCardProps {
  material: StudyMaterial;
  topics: StudyTopic[];
  taxonomyVersion: number;
  onInspect: () => void;
  onTopic: (id: string) => void;
}

type PdfModule = typeof import("react-pdf");
type PreviewKind = "image" | "pdf";
const MAX_SVG_PREVIEW_BYTES = 5 * 1024 * 1024;
const actionClass =
  "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-radius-md px-2.5 py-1 text-xs font-medium hover:bg-primary-500/10 hover:text-primary-500 focus-visible:outline-2 focus-visible:outline-primary-500";

function previewKind(material: StudyMaterial): PreviewKind | null {
  if (!material.isFile) return null;
  if (material.mimeType?.startsWith("image/")) return "image";
  if (material.mimeType === "application/pdf") return "pdf";
  if (!material.mimeType && /\.pdf$/i.test(material.title)) return "pdf";
  if (!material.mimeType && /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(material.title)) {
    return "image";
  }
  return null;
}

function PdfPreview({ url }: { url: string }) {
  const [pdf, setPdf] = useState<PdfModule | null>(null);
  const [failed, setFailed] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1 / Math.SQRT2);
  const [size, setSize] = useState({ width: 160, height: 128 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void import("react-pdf").then(
      (module) => {
        if (cancelled) return;
        module.pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.js";
        setPdf(module);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      setSize({ width: container.clientWidth, height: container.clientHeight });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const width = Math.max(1, Math.min(size.width, size.height * aspectRatio));
  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center overflow-hidden"
      aria-label="First page preview"
    >
      {failed ? (
        <p className="px-3 text-center text-xs text-text-tertiary">Preview unavailable</p>
      ) : pdf ? (
        <pdf.Document
          file={url}
          suspense={false}
          loading={<p className="text-xs text-text-tertiary">Loading PDF...</p>}
          error={<p className="text-xs text-text-tertiary">Preview unavailable</p>}
          onLoadError={() => setFailed(true)}
          className="flex items-center justify-center"
        >
          <pdf.Page
            pageNumber={1}
            suspense={false}
            width={width}
            devicePixelRatio={1}
            renderAnnotationLayer={false}
            renderTextLayer={false}
            loading={<p className="text-xs text-text-tertiary">Rendering page...</p>}
            onLoadSuccess={(page) => {
              if (page.originalWidth > 0 && page.originalHeight > 0) {
                setAspectRatio(page.originalWidth / page.originalHeight);
              }
            }}
            onLoadError={() => setFailed(true)}
            onRenderError={() => setFailed(true)}
          />
        </pdf.Document>
      ) : (
        <p className="text-xs text-text-tertiary">Loading PDF...</p>
      )}
    </div>
  );
}

function SvgPreview({ url, title }: { url: string; title: string }) {
  const [imageUrl, setImageUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    let objectUrl = "";
    const load = async () => {
      try {
        // the proxy downloads SVGs as octet-stream; keep their content inside an image element
        const response = await fetch(url, { signal: controller.signal });
        if (!mounted) return;
        if (!response.ok || !response.body) throw new Error("SVG preview unavailable");
        if (Number(response.headers.get("Content-Length")) > MAX_SVG_PREVIEW_BYTES) {
          controller.abort();
          throw new Error("SVG preview is too large");
        }
        const reader = response.body.getReader();
        const chunks: BlobPart[] = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_SVG_PREVIEW_BYTES) {
              controller.abort();
              await reader.cancel();
              throw new Error("SVG preview is too large");
            }
            chunks.push(new Uint8Array(value));
          }
        } finally {
          reader.releaseLock();
        }
        if (!mounted) return;
        if (size === 0) throw new Error("SVG preview is empty");
        objectUrl = URL.createObjectURL(new Blob(chunks, { type: "image/svg+xml" }));
        setImageUrl(objectUrl);
      } catch {
        controller.abort();
        if (mounted) setFailed(true);
      }
    };
    void load();
    return () => {
      mounted = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (failed) {
    return <p className="px-3 text-center text-xs text-text-tertiary">Preview unavailable. Open the original to read it.</p>;
  }
  if (!imageUrl) return <p className="text-xs text-text-tertiary">Loading preview...</p>;
  return (
    <img
      src={imageUrl}
      alt={`Preview of ${title || "attached image"}`}
      className="h-full w-full object-contain"
      decoding="async"
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
}

function FilePreview({
  material,
  kind,
}: {
  material: StudyMaterial;
  kind: PreviewKind;
}) {
  const { url, loading, error } = useSignedUrl(undefined, material.noteId);
  const [imageFailed, setImageFailed] = useState(false);

  if (loading) {
    return <p className="text-xs text-text-tertiary">Loading preview...</p>;
  }
  if (error || !url || imageFailed) {
    return <p className="px-3 text-center text-xs text-text-tertiary">Preview unavailable. Open the original to read it.</p>;
  }
  if (kind === "pdf") return <PdfPreview url={url} />;
  if (material.mimeType === "image/svg+xml" || (!material.mimeType && /\.svg$/i.test(material.title))) {
    return <SvgPreview key={url} url={url} title={material.title} />;
  }
  return (
    <img
      src={url}
      alt={`Preview of ${material.title || "attached image"}`}
      className="h-full w-full object-contain"
      loading="lazy"
      decoding="async"
      onError={() => setImageFailed(true)}
      draggable={false}
    />
  );
}

function reviewState(material: StudyMaterial, taxonomyVersion: number): string {
  const reviewed = material.overrides.sourceHash === material.currentHash &&
    material.overrides.taxonomyVersion === taxonomyVersion &&
    !material.taxonomyEvidenceStale;
  const stale = material.status === "stale" || material.taxonomyEvidenceStale ||
    (material.sourceHash !== "" && material.sourceHash !== material.currentHash) ||
    (material.classifiedAt !== null && material.taxonomyVersion !== taxonomyVersion);
  if (reviewed) return "Reviewed by you";
  if (stale) return "Needs review";
  if (material.status === "failed") return "Classification failed";
  if (material.status === "classified") return "Classified";
  return "Not classified";
}

export function StudyBoardCard({
  material,
  topics,
  taxonomyVersion,
  onInspect,
  onTopic,
}: StudyBoardCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const kind = previewKind(material);
  const associations = useMemo(() => {
    const topicsById = new Map(topics.map((topic) => [topic.id, topic]));
    return effectiveAssociations(material, taxonomyVersion).flatMap((association) => {
      const topic = topicsById.get(association.topicId);
      return topic ? [{ topic, association }] : [];
    });
  }, [material, topics, taxonomyVersion]);
  const badges = associations.slice(0, 3);
  const labels = material.overrides.labels ?? material.labels;
  const format = kind === "pdf" ? "PDF" : kind === "image" ? "Image" : material.isFile ? "File" : "Note";
  const Icon = kind === "image" ? PhotoIcon : DocumentTextIcon;

  useEffect(() => {
    const card = cardRef.current;
    if (!card || !kind) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setVisible(entry.isIntersecting);
    });
    observer.observe(card);
    return () => observer.disconnect();
  }, [kind]);

  return (
    <article
      ref={cardRef}
      className="flex h-full w-full min-w-0 flex-col overflow-auto rounded-radius-lg border border-border-subtle bg-surface font-sans text-text shadow-sm"
      aria-label={`${material.title || "Untitled note"}, ${format}`}
    >
      <header className="shrink-0 space-y-2 border-b border-border-subtle px-4 py-3">
        <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
          <span className="flex min-w-0 items-center gap-1.5 font-medium text-text-secondary">
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {format}
            <span className="truncate font-normal text-text-tertiary">· {(material.overrides.kind ?? material.kind).replaceAll("_", " ")}</span>
          </span>
          <span className="shrink-0 text-text-tertiary">Live source</span>
        </div>
        <h3 className="line-clamp-2 break-words text-base font-semibold">{material.title || "Untitled note"}</h3>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {kind && (
          <div className="flex h-32 items-center justify-center overflow-hidden rounded-radius-md border border-border-subtle bg-background">
            {visible ? (
              <FilePreview key={`${material.noteId}:${material.currentHash}`} material={material} kind={kind} />
            ) : <span className="text-xs text-text-tertiary">{format} preview</span>}
          </div>
        )}
        {!kind && material.isFile && (
          <p className="break-words text-xs text-text-tertiary">{material.mimeType || "File attachment"}</p>
        )}
        <p className="line-clamp-3 break-words text-sm text-text-secondary">{material.excerpt || "Open the original material to read it."}</p>

        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Related topics">
            {badges.map(({ topic, association }) => {
              const source = association.evidence[0]?.anchor;
              return (
                <div key={topic.id} className="flex max-w-full items-center rounded-radius-md bg-primary-500/5">
                  <button
                    type="button"
                    className={`${actionClass} min-w-0 flex-col items-start gap-0 text-left text-text-secondary`}
                    onClick={() => onTopic(topic.id)}
                    aria-label={`Show ${topic.name}, ${association.status === "suggested" ? "suggested" : "accepted"} ${association.relevance} topic`}
                  >
                    <span className="max-w-full truncate">{topic.name}</span>
                    <span className="text-xs font-normal text-text-tertiary">{association.status === "suggested" ? "Suggested · " : ""}{association.relevance}</span>
                  </button>
                  {source && (
                    <Link href={`/notes/${source.noteId}`} className={`${actionClass} shrink-0 px-1.5 text-text-secondary`} aria-label={`Open source for ${topic.name}`} title={`Source evidence${source.page ? `, page ${source.page}` : `, line ${source.line}`}`}>
                      <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              );
            })}
            {associations.length > badges.length && (
              <button type="button" className={`${actionClass} text-text-secondary`} onClick={onInspect}>+{associations.length - badges.length} topics</button>
            )}
          </div>
        )}
        {labels.length > 0 && <p className="line-clamp-1 text-xs text-text-tertiary" title={labels.join(", ")}>{labels.join(" · ")}</p>}

        {material.references.length > 0 && (
          <div className="space-y-1 border-t border-border-subtle pt-2">
            <p className="text-xs text-text-tertiary">{material.references.length} linked {material.references.length === 1 ? "material" : "materials"}</p>
            {material.references.slice(0, 2).map((reference) => (
              <Link key={reference.id} href={`/notes/${reference.id}`} aria-label={`${reference.title || "Untitled note"}, ${reference.kind === "file" ? "file" : reference.kind === "embedded" ? "embedded note" : "note"}`} className="flex min-w-0 items-center gap-1.5 rounded-radius-sm py-1 text-xs text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-primary-300">
                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{reference.title || "Untitled note"}</span>
                <span className="shrink-0 text-text-tertiary">{reference.kind === "file" ? "File" : reference.kind === "embedded" ? "Embedded" : "Note"}</span>
              </Link>
            ))}
            {material.references.length > 2 && <button type="button" className={`${actionClass} text-text-secondary`} onClick={onInspect}>View all linked materials</button>}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-border-subtle px-3 py-2">
        <p className="px-1 pb-1 text-xs text-text-tertiary">{reviewState(material, taxonomyVersion)}</p>
        <div className="flex flex-wrap items-center justify-between gap-1">
          <Link href={`/notes/${material.noteId}`} className={`${actionClass} text-primary-700 dark:text-primary-300`}>
            Open original <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <button type="button" className={`${actionClass} text-text-secondary`} onClick={onInspect} aria-label={`Inspect ${material.title || "Untitled note"}`}>Inspect</button>
        </div>
      </footer>
    </article>
  );
}
