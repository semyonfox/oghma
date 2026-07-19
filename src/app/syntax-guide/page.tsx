import Link from "next/link";
import SyntaxGuideContent from "./syntax-guide-content";
import { getServerI18n } from "@/lib/i18n/server";

export default async function SyntaxGuidePage() {
  const { t } = await getServerI18n();

  return (
    <div className="min-h-screen bg-app-page text-text">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/notes"
            className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
          >
            {t("← Back to Notes")}
          </Link>
        </div>
        <SyntaxGuideContent t={t} />
      </div>
    </div>
  );
}
