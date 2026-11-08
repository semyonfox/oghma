"use client";

import useI18n from "@/lib/notes/hooks/use-i18n";
import CanvasIntegrationSettings from "./canvas-integration-settings";
import { SettingsCard, SettingsCardBody } from "./settings-card";

export default function CanvasSection() {
  const { t } = useI18n();

  return (
    <SettingsCard
      id="canvas"
      title={t("Canvas Integration")}
      description={t(
        "Connect your Canvas LMS account to import your courses and lecture materials.",
      )}
    >
      <SettingsCardBody>
        <h3 className="mb-4 text-sm/6 font-medium text-text">
          {t("Connect Canvas Account")}
        </h3>
        <CanvasIntegrationSettings />
      </SettingsCardBody>
    </SettingsCard>
  );
}
