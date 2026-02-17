// Loading skeleton for editor while Lexical library loads
import { FC } from 'react';

const EditorSkeleton: FC = () => {
  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Toolbar skeleton */}
      <div className="border-b border-border px-4 py-2 bg-white/5">
        <div className="flex gap-2">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-8 w-8 rounded bg-white/10 animate-pulse"
            />
          ))}
        </div>
      </div>

      {/* Content skeleton */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Title skeleton */}
          <div className="h-12 w-3/4 rounded bg-white/10 animate-pulse" />

          {/* Content lines skeleton */}
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="h-4 rounded bg-white/10 animate-pulse"
              style={{
                width: `${Math.random() * 30 + 70}%`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Bottom info skeleton */}
      <div className="border-t border-border px-4 py-2 bg-white/5">
        <div className="h-4 w-32 rounded bg-white/10 animate-pulse" />
      </div>
    </div>
  );
};

export default EditorSkeleton;
