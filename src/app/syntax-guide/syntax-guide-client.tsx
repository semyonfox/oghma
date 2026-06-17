"use client";

import PreviewRenderer from "@/components/editor/preview-renderer";
import useSyntaxGuideContent from "@/lib/hooks/use-syntax-guide-content";

export default function SyntaxGuideClient() {
  const guideContent = useSyntaxGuideContent();

  return <PreviewRenderer content={guideContent} />;
}
