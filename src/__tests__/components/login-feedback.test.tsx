// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ providers: vi.fn(), login: vi.fn(), signIn: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("next-auth/react", () => ({ getProviders: mocks.providers, signIn: mocks.signIn }));
vi.mock("@/lib/apiClient", () => ({ login: mocks.login, getErrorMessage: () => "Invalid sign-in details" }));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({ default: () => ({ t: (key: string) => key }) }));
import LoginPage from "@/app/login/page";

afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.providers.mockResolvedValue({}); });
describe("sign-in feedback", () => {
  it("keeps unconfirmed social providers disabled", async () => {
    mocks.providers.mockReturnValue(new Promise(() => {}));
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: "Google" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "GitHub" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByRole("status").at(-1)?.textContent).toBe("Loading...");
  });
  it("announces failed credentials and focuses feedback after it mounts", async () => {
    mocks.login.mockRejectedValue(new Error("Invalid sign-in details"));
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "student@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-password" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(alert.textContent).toContain("Invalid sign-in details");
    expect(screen.getByRole("button", { name: "Sign in" }).hasAttribute("disabled")).toBe(false);
  });
  it("retries failed provider discovery without reloading the credential form", async () => {
    mocks.providers.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ google: { id: "google", name: "Google", type: "oauth", signinUrl: "/signin", callbackUrl: "/callback" } });
    render(<LoginPage />);
    const retry = await screen.findByRole("button", { name: "Try again" });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "student@example.test" } });
    fireEvent.click(retry);
    expect(document.activeElement).toBe(screen.getAllByRole("status").at(-1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Google" }).hasAttribute("disabled")).toBe(false));
    expect(screen.getByLabelText("Email address").getAttribute("value")).toBe("student@example.test");
  });

  it("exposes a main landmark and persistent pending status, retaining input after a transient failure", async () => {
    let rejectLogin: (reason: Error) => void = () => {};
    mocks.login.mockImplementation(() => new Promise((_resolve, reject) => { rejectLogin = reject; }));
    render(<LoginPage />);
    expect(screen.getByRole("main")).toBeDefined();
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "student@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-password" } });
    const form = screen.getByRole("button", { name: "Sign in" }).closest("form")!;
    fireEvent.submit(form);
    expect(form.getAttribute("aria-busy")).toBe("true");
    const status = screen.getAllByRole("status").find((element) => element.textContent === "Signing in...");
    expect(status).toBeDefined();
    expect(status?.closest('[aria-busy="true"]')).toBeNull();
    rejectLogin(new Error("offline"));
    await screen.findByRole("alert");
    expect(form.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByLabelText("Password").getAttribute("value")).toBe("synthetic-password");
    expect(status?.isConnected).toBe(true);
  });

  it("refocuses an identical transient error when retrying unchanged credentials", async () => {
    mocks.login.mockRejectedValue(new Error("offline"));
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "student@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-password" } });
    const submit = screen.getByRole("button", { name: "Sign in" });
    const form = submit.closest("form")!;
    fireEvent.submit(form);
    const first = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(first));
    submit.focus(); fireEvent.submit(form);
    expect(screen.queryByRole("alert")).toBeNull();
    const second = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(second));
    expect(second).not.toBe(first);
    expect(screen.getByLabelText("Password").getAttribute("value")).toBe("synthetic-password");
  });

});
