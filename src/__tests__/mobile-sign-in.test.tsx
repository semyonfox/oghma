// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const navigation = vi.hoisted(() => ({ query: "" }));
const providers = vi.hoisted(() => ({ getProviders: vi.fn(), signIn: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(navigation.query) }));
vi.mock("next-auth/react", () => providers);
vi.mock("@/components/brand-logo", () => ({ default: () => null }));
import MobileSignIn from "@/app/auth/mobile/sign-in";
const state = "a".repeat(64);
const challenge = "b".repeat(43);
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  navigation.query = new URLSearchParams({ provider: "google", state, code_challenge: challenge }).toString();
  providers.getProviders.mockResolvedValue({ google: { id: "google" } });
  providers.signIn.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("mobile browser sign-in", () => {
  it("starts the website provider with the app-bound callback", async () => {
    render(<MobileSignIn />);
    await waitFor(() => expect(providers.signIn).toHaveBeenCalled());
    const options = providers.signIn.mock.calls[0][1];
    const callback = new URL(options.callbackUrl, "https://oghmanotes.ie");
    expect(callback.pathname).toBe("/auth/mobile");
    expect(callback.searchParams.get("state")).toBe(state);
    expect(callback.searchParams.get("code_challenge")).toBe(challenge);
    expect(callback.searchParams.get("complete")).toBe("1");
  });
  it("rejects an incomplete request before opening a provider", () => {
    navigation.query = "provider=google&state=bad";
    render(<MobileSignIn />);
    expect(screen.getByRole("alert").textContent).toContain("incomplete");
    expect(providers.signIn).not.toHaveBeenCalled();
  });
  it("never presents an unconfigured provider as working", async () => {
    providers.getProviders.mockResolvedValue({});
    render(<MobileSignIn />);
    await screen.findByRole("alert");
    expect(providers.signIn).not.toHaveBeenCalled();
  });
  it("requires confirmation of the OAuth browser identity before issuing a grant", async () => {
    navigation.query += "&complete=1";
    fetchMock.mockResolvedValue(Response.json({user:{user_id:"52e2fce0-2b07-4ed9-b901-bfc3996d6b4e",email:"browser@example.test"}}));
    render(<MobileSignIn />);
    expect(await screen.findByText("browser@example.test")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue to OghmaNotes" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined();
    expect(providers.signIn).not.toHaveBeenCalled();
  });
});
