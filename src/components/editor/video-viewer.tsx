'use client';

import { FC, useRef } from 'react';
import { FileSpec } from '@/lib/notes/state/layout.zustand';

interface VideoViewerProps {
  file: FileSpec;
}

/**
 * Video viewer component with HTML5 controls
 * Supports play, pause, volume, progress, speed, and fullscreen
 */
const VideoViewer: FC<VideoViewerProps> = ({ file }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const videoSrc = file.title || '';

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 bg-gray-900 border-b border-white/10 flex items-center justify-between">
        <span className="text-xs text-gray-400">{file.title}</span>
        <span className="text-xs text-gray-600">Video</span>
      </div>

      {/* Video Player */}
      <div className="flex-1 flex items-center justify-center bg-gray-950 overflow-hidden">
        <video
          ref={videoRef}
          src={videoSrc}
          controls
          crossOrigin="anonymous"
          className="w-full h-full object-contain bg-black"
        >
          Your browser does not support the video tag.
        </video>
      </div>
    </div>
  );
};

export default VideoViewer;
