"use client";

import { type FormEvent, useState } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { reportTelemetry } from "@/lib/marketing/client";

// must match the source enum accepted by /api/contact
type ContactFormProps = { source?: "contact" | "home"; centered?: boolean };
type SubmitResult = { status: "success" | "error"; message: string } | null;

export default function ContactForm({ source = "contact", centered = false }: ContactFormProps) {
  const { t } = useI18n();
  const [result, setResult] = useState<SubmitResult>(null);
  const [isLoading, setIsLoading] = useState(false);
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      ...Object.fromEntries(formData.entries()),
      source,
    };

    const run = async () => {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data: unknown = await response.json();
      const accepted =
        typeof data === "object" &&
        data !== null &&
        Reflect.get(data, "success") === true;

      if (response.ok && accepted) {
        setResult({ status: "success", message: t("Message sent successfully!") });
        form.reset();
        reportTelemetry({ kind: "count", name: "action_completed", route: "help" });
        setTimeout(() => setResult(null), 5000);
      } else {
        reportTelemetry({ kind: "error", name: "request_failed", route: "help" });
        setResult({ status: "error", message: t("Error sending message. Please try again.") });
      }
    };
    await run()
      .catch(() => {
        reportTelemetry({ kind: "error", name: "request_failed", route: "help" });
        setResult({ status: "error", message: t("Error sending message. Please try again.") });
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  return (
    <form
      onSubmit={onSubmit}
      className={
        centered
          ? "mx-auto w-full max-w-2xl"
          : "mx-auto max-w-xl lg:mr-0 lg:max-w-lg"
      }
    >
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
        <div aria-hidden="true" className="hidden">
          <label htmlFor="website">Website</label>
          <input
            id="website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
        <div>
          <label
            htmlFor="full-name"
            className="block text-sm/6 font-semibold text-text"
          >
            {t("Full name")}
          </label>
          {/* the field is still named first_name on the wire: the API schema
              and app.marketing_leads column keep that name */}
          <div className="mt-2.5">
            <input
              id="full-name"
              name="first_name"
              type="text"
              autoComplete="name"
              required
              className="block w-full rounded-radius-md bg-input px-3.5 py-2 text-base text-text outline-1 -outline-offset-1 outline-border placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="email"
            className="block text-sm/6 font-semibold text-text"
          >
            {t("Email")}
          </label>
          <div className="mt-2.5">
            <input
              id="email"
              name="email"
              type="email"
              required
              className="block w-full rounded-radius-md bg-input px-3.5 py-2 text-base text-text outline-1 -outline-offset-1 outline-border placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500"
            />
          </div>
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor="interest"
            className="block text-sm/6 font-semibold text-text"
          >
            {t("What brings you here?")}
          </label>
          <div className="mt-2.5">
            <select
              id="interest"
              name="interest"
              required
              defaultValue=""
              className="block w-full rounded-radius-md bg-input px-3.5 py-2 text-base text-text outline-1 -outline-offset-1 outline-border focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500"
            >
              <option value="" disabled>
                {t("Select an option")}
              </option>
              <option value="beta_access">{t("Beta access")}</option>
              <option value="campus_pilot">{t("Campus pilot")}</option>
              <option value="support">{t("Support")}</option>
              <option value="billing">{t("Billing")}</option>
              <option value="partnership">{t("Partnership")}</option>
              <option value="other">{t("Other")}</option>
            </select>
          </div>
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor="message"
            className="block text-sm/6 font-semibold text-text"
          >
            {t("Message")}
          </label>
          <div className="mt-2.5">
            <textarea
              id="message"
              name="message"
              rows={4}
              required
              className="block w-full rounded-radius-md bg-input px-3.5 py-2 text-base text-text outline-1 -outline-offset-1 outline-border placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500"
            />
          </div>
        </div>
      </div>
      <div className="mt-8 flex flex-col items-end gap-4">
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-radius-md bg-primary-600 px-3.5 py-2.5 text-center text-sm font-semibold text-text-on-primary shadow-xs hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? t("Sending...") : t("Send message")}
        </button>
        {result && (
          <p
            role={result.status === "error" ? "alert" : "status"}
            className={`text-sm ${result.status === "success" ? "text-success-500" : "text-error-500"}`}
          >
            {result.message}
          </p>
        )}
      </div>
    </form>
  );
}
