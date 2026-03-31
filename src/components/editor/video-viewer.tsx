"use client";

import { FC, useRef } from "react";
import { FileSpec } from "@/lib/notes/state/layout.zustand";
import { useSignedUrl } from "./use-signed-url";
import useI18n from "@/lib/notes/hooks/use-i18n";

interface VideoViewerProps {
  file: FileSpec;
}

/**
 * Video viewer component with HTML5 controls
 * Supports play, pause, volume, progress, speed, and fullscreen
 */
const VideoViewer: FC<VideoViewerProps> = ({ file }) => {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { url: videoSrc } = useSignedUrl(file.sourcePath);

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 bg-background border-b border-border-subtle flex items-center justify-between">
        <span className="text-xs text-text-tertiary">{file.title}</span>
        <span className="text-xs text-text-tertiary opacity-60">
          {t("video_viewer.label")}
        </span>
      </div>

      {/* Video Player */}
      <div className="flex-1 flex items-center justify-center bg-surface overflow-hidden">
        <video
          ref={videoRef}
          src={videoSrc}
          controls
          crossOrigin="anonymous"
          className="w-full h-full object-contain bg-black"
        >
          {t("video_viewer.no_support")}
        </video>
      </div>
    </div>
  );
};

export default VideoViewer;
