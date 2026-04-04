"use client";

import PreviewRenderer from "@/components/editor/preview-renderer";
import Link from "next/link";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useSyntaxGuideContent from "@/lib/hooks/use-syntax-guide-content";

export default function SyntaxGuidePage() {
  const { t } = useI18n();
  const guideContent = useSyntaxGuideContent();

  return (
    <div className="min-h-screen bg-background text-text">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/notes"
            className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
          >
            {t("&larr; Back to Notes")}
          </Link>
        </div>
        <PreviewRenderer content={guideContent} />
      </div>
    </div>
  );
}
