"use client";

import useI18n from "@/lib/notes/hooks/use-i18n";
import CanvasIntegration from "./canvas-integration";

export default function CanvasSection() {
  const { t } = useI18n();

  return (
    <div
      id="canvas"
      className="grid grid-cols-1 gap-x-8 gap-y-10 py-12 md:grid-cols-3"
    >
      <div>
        <h2 className="text-base/7 font-semibold text-text">
          {t("Canvas Integration")}
        </h2>
        <p className="mt-1 text-sm/6 text-text-tertiary">
          {t(
            "Connect your Canvas LMS account to import your courses and lecture materials.",
          )}
        </p>
      </div>

      <div className="md:col-span-2 space-y-8">
        <div>
          <h3 className="text-sm/6 font-medium text-text mb-4">
            {t("Connect Canvas Account")}
          </h3>
          <CanvasIntegration />
        </div>
      </div>
    </div>
  );
}
