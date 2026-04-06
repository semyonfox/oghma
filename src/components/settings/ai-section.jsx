"use client";

import useI18n from "@/lib/notes/hooks/use-i18n";
import { inputClass } from "./settings-utils";

export default function AISection() {
  const { t } = useI18n();

  return (
    <div
      id="ai"
      className="grid grid-cols-1 gap-x-8 gap-y-10 py-12 md:grid-cols-3"
    >
      <div>
        <h2 className="text-base/7 font-semibold text-text">
          {t("AI Settings")}
        </h2>
        <p className="mt-1 text-sm/6 text-text-tertiary">
          {t("Configure AI-powered features for your notes.")}
        </p>
      </div>

      <div className="md:col-span-2">
        <div className="space-y-8">
          {/* model selector */}
          <div>
            <label
              htmlFor="ai-model"
              className="block text-sm/6 font-medium text-text"
            >
              {t("Model")}
            </label>
            <p className="mt-1 text-sm text-text-tertiary">
              {t("Powers chat, search, and study features.")}
            </p>
            <div className="mt-2 sm:max-w-xs">
              <select
                id="ai-model"
                className={`${inputClass} appearance-auto`}
                defaultValue="kimi-k2.5"
                disabled
              >
                <option value="kimi-k2.5">Kimi K2.5</option>
              </select>
            </div>
          </div>

          {/* BYOK status */}
          <div className="border-t border-border pt-6">
            <div className="flex items-center gap-2">
              <h3 className="text-sm/6 font-medium text-text">
                {t("Bring Your Own Key")}
              </h3>
              <span className="inline-flex items-center rounded-md bg-primary-500/10 px-2 py-0.5 text-xs font-medium text-primary-400 ring-1 ring-inset ring-primary-500/20">
                {t("Beta")}
              </span>
            </div>
            <p className="mt-1 text-sm text-text-tertiary">
              {t("Bring Your Own Key is not available yet for beta users.")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
