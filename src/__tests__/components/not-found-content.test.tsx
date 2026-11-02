// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NotFoundContent from "@/app/not-found-content";
import I18nProvider from "@/lib/i18n/provider";
import { Locale } from "@/locales";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ back: vi.fn() }),
}));

afterEach(cleanup);

describe("NotFoundContent", () => {
  it("renders without the root layout's provider", () => {
    render(<NotFoundContent homeUrl="/" />);

    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeTruthy();
  });

  it("keeps the root layout's locale when the provider is there", () => {
    render(
      <I18nProvider
        locale={Locale.GA}
        lngDict={{ "error.page_not_found": "Níor aimsíodh an leathanach" }}
      >
        <NotFoundContent homeUrl="/" />
      </I18nProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Níor aimsíodh an leathanach" }),
    ).toBeTruthy();
  });
});
