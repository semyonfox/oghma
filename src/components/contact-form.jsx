"use client";

import { useRef, useState } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { trackMarketingEvent } from "@/lib/marketing/client";

function messageLengthBucket(value) {
  const length = typeof value === "string" ? value.trim().length : 0;
  if (length <= 100) return "0-100";
  if (length <= 500) return "101-500";
  return "500+";
}

function formAnalyticsPayload(form) {
  const formData = new FormData(form);
  const institution = formData.get("institution");
  const phone = formData.get("phone");
  const message = formData.get("message");

  return {
    role: formData.get("role") || undefined,
    interest: formData.get("interest") || undefined,
    has_institution:
      typeof institution === "string" && institution.trim().length > 0,
    has_phone: typeof phone === "string" && phone.trim().length > 0,
    message_length_bucket: messageLengthBucket(message),
  };
}

export default function ContactForm({ source = "contact" }) {
  const { t } = useI18n();
  const [result, setResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const startedRef = useRef(false);

  const trackStart = () => {
    if (startedRef.current) return;
    startedRef.current = true;
    trackMarketingEvent("contact_form_start", {
      source: "contact_form",
      properties: {
        page: source,
        form: "contact",
      },
    });
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);

    const accessKey = process.env.NEXT_PUBLIC_WEB3FORMS_KEY;
    if (!accessKey) {
      setResult(t("contact.not_configured"));
      setIsLoading(false);
      return;
    }

    trackMarketingEvent("contact_form_submit", {
      source: "contact_form",
      properties: {
        page: source,
        form: "contact",
        ...formAnalyticsPayload(event.currentTarget),
      },
    });

    const formData = new FormData(event.target);
    formData.append("access_key", accessKey);
    formData.append("subject", "OghmaNotes website lead");
    formData.append("from_name", "OghmaNotes website");

    try {
      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        trackMarketingEvent("contact_form_success", {
          source: "contact_form",
          properties: {
            page: source,
            form: "contact",
            ...formAnalyticsPayload(event.currentTarget),
          },
        });
        setResult(t("Message sent successfully!"));
        event.target.reset();
        startedRef.current = false;
        setTimeout(() => setResult(""), 5000);
      } else {
        trackMarketingEvent("contact_form_error", {
          source: "contact_form",
          properties: {
            page: source,
            form: "contact",
            error_type: "provider_error",
          },
        });
        setResult(t("Error sending message. Please try again."));
      }
    } catch (_error) {
      trackMarketingEvent("contact_form_error", {
        source: "contact_form",
        properties: {
          page: source,
          form: "contact",
          error_type: "network_error",
        },
      });
      setResult(t("Error sending message. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      onFocusCapture={trackStart}
      onChangeCapture={trackStart}
      className="mx-auto max-w-xl lg:mr-0 lg:max-w-lg"
    >
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
        <div>
          <label
            htmlFor="first-name"
            className="block text-sm/6 font-semibold text-text"
          >
            {t("First name")}
          </label>
          <div className="mt-2.5">
            <input
              id="first-name"
              name="first_name"
              type="text"
              required
              className="block w-full rounded-radius-md bg-input px-3.5 py-2 text-base text-text outline-1 -outline-offset-1 outline-border placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="last-name"
            className="block text-sm/6 font-semibold text-text"
          >
            {t("Last name")}
          </label>
          <div className="mt-2.5">
            <input
              id="last-name"
              name="last_name"
              type="text"
              required
              className="block w-full rounded-radius-md bg-input px-3.5 py-2 text-base text-text outline-1 -outline-offset-1 outline-border placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="role"
            className="block text-sm/6 font-semibold text-text"
          >
            {t("I am a")}
          </label>
          <div className="mt-2.5">
            <select
              id="role"
              name="role"
              required
              defaultValue=""
              className="block w-full rounded-radius-md bg-input px-3.5 py-2 text-base text-text outline-1 -outline-offset-1 outline-border focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500"
            >
              <option value="" disabled>
                {t("Select a role")}
              </option>
              <option value="student">{t("Student")}</option>
              <option value="lecturer">{t("Lecturer")}</option>
              <option value="university_staff">{t("University staff")}</option>
              <option value="partner_or_press">{t("Partner or press")}</option>
            </select>
          </div>
        </div>
        <div>
          <label
            htmlFor="interest"
            className="block text-sm/6 font-semibold text-text"
          >
            {t("I need help with")}
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
            </select>
          </div>
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor="institution"
            className="block text-sm/6 font-semibold text-text"
          >
            {t("University or organization")}
          </label>
          <div className="mt-2.5">
            <input
              id="institution"
              name="institution"
              type="text"
              className="block w-full rounded-radius-md bg-input px-3.5 py-2 text-base text-text outline-1 -outline-offset-1 outline-border placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500"
            />
          </div>
        </div>
        <div className="sm:col-span-2">
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
            htmlFor="phone"
            className="block text-sm/6 font-semibold text-text"
          >
            {t("Phone number")}
          </label>
          <div className="mt-2.5">
            <input
              id="phone"
              name="phone"
              type="tel"
              className="block w-full rounded-radius-md bg-input px-3.5 py-2 text-base text-text outline-1 -outline-offset-1 outline-border placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500"
            />
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
            className={`text-sm ${result.includes("success") ? "text-success-500" : "text-error-500"}`}
          >
            {result}
          </p>
        )}
      </div>
    </form>
  );
}
