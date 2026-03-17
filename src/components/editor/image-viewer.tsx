'use client';

import { FC, useState, useCallback } from 'react';
import { FileSpec } from '@/lib/notes/state/layout.zustand';
import { MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import { useFileUrl } from './use-file-url';

interface ImageViewerProps {
  file: FileSpec;
}

/**
 * Image viewer component with zoom and pan
 * Supports zoom in/out and reset
 */
const ImageViewer: FC<ImageViewerProps> = ({ file }) => {
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const { url: imageSrc, loading } = useFileUrl(file.sourcePath);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + 0.2, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - 0.2, 0.5));
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPanX(e.clientX - dragStart.x);
      setPanY(e.clientY - dragStart.y);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Controls */}
      <div className="flex-shrink-0 px-4 py-3 bg-gray-900 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{file.title}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <button
            onClick={handleZoomOut}
            className="p-2 rounded hover:bg-white/10"
          >
            <MagnifyingGlassMinusIcon className="w-4 h-4" />
          </button>

          <span className="text-xs text-gray-400 min-w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>

          <button
            onClick={handleZoomIn}
            className="p-2 rounded hover:bg-white/10"
          >
            <MagnifyingGlassPlusIcon className="w-4 h-4" />
          </button>

          {/* Reset */}
          <div className="w-px h-4 bg-white/10 mx-1" />
          <button
            onClick={handleReset}
            className="p-2 rounded hover:bg-white/10"
            title="Reset zoom"
          >
            <ArrowUturnLeftIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Image Container */}
      <div
        className="flex-1 overflow-auto bg-gray-950 flex items-center justify-center cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: 'center',
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          }}
        >
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={file.title}
              className="max-w-2xl max-h-96 select-none"
              onDragStart={(e) => e.preventDefault()}
            />
          ) : (
            <div className="text-sm text-gray-500">{loading ? 'Loading image...' : 'Image unavailable'}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageViewer;
