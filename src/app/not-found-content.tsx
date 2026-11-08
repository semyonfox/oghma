"use client";

import { Button } from "@/components/catalyst/button";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import I18nRootProvider from "@/components/providers/i18n-root-provider";
import { I18nContext } from "@/lib/i18n/provider";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { useRouter } from "next/navigation";
import { use } from "react";

export default function NotFoundContent({ homeUrl }: { homeUrl: string }) {
  // next renders not-found without the root layout, so without its provider,
  // when a urlencoded POST carries a Next-Action header
  if (!use(I18nContext)) {
    return (
      <I18nRootProvider>
        <NotFoundBody homeUrl={homeUrl} />
      </I18nRootProvider>
    );
  }

  return <NotFoundBody homeUrl={homeUrl} />;
}

function NotFoundBody({ homeUrl }: { homeUrl: string }) {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 py-24 sm:py-32 lg:px-8">
      <div className="text-center">
        <p className="font-mono text-sm font-medium text-accent">
          {t("error.404")}
        </p>
        <Heading className="mt-4 font-serif text-5xl font-semibold tracking-tight sm:text-7xl">
          {t("error.page_not_found")}
        </Heading>
        <Text className="mt-6 text-lg text-text-secondary sm:text-xl/8">
          {t("error.page_not_found_description")}
        </Text>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
          <Button href={homeUrl}>{t("error.go_home")}</Button>
          <Button plain onClick={() => router.back()}>
            {t("error.go_back")} <span aria-hidden="true">&rarr;</span>
          </Button>
        </div>
      </div>
    </main>
  );
}
