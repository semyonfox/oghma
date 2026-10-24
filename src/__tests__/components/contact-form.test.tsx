// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const french: Record<string, string> = {
  "Message sent successfully!": "Message envoyé avec succès !",
  "Error sending message. Please try again.": "Erreur lors de l'envoi du message.",
};
vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (key: string) => french[key] ?? key }),
}));
vi.mock("@/lib/marketing/client", () => ({ reportTelemetry: vi.fn() }));

import ContactForm from "@/components/contact-form";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, notificationDelivered: true })),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function submit() {
  fireEvent.submit(screen.getByRole("button", { name: "Send message" }).closest("form")!);
}

it("styles a translated success message as success", async () => {
  render(<ContactForm source="home" />);
  submit();

  const message = await screen.findByRole("status");
  expect(message.textContent).toBe("Message envoyé avec succès !");
  expect(message.className).toContain("text-success-500");
  const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
  expect(body.source).toBe("home");
});

it("treats a non-JSON gateway error as a failure", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response("<html>bad gateway</html>", { status: 502 }));
  render(<ContactForm />);
  submit();

  const message = await screen.findByRole("alert");
  expect(message.textContent).toBe("Erreur lors de l'envoi du message.");
  expect(message.className).toContain("text-error-500");
});
