import PublicInfoPage, { InfoSection } from "@/components/public-info-page";

export const metadata = {
  title: "Cookie Notice",
  description: "How OghmaNotes uses cookies and local browser storage.",
};

export default function CookiesPage() {
  return (
    <PublicInfoPage
      eyebrow="Cookies"
      title="Cookie Notice"
      description="OghmaNotes uses essential cookies and browser storage to keep the app working. We do not use advertising cookies."
    >
      <InfoSection title="Essential Cookies">
        <p>
          We use authentication cookies to keep you signed in and protect your
          session. These are required for the app to work.
        </p>
      </InfoSection>

      <InfoSection title="Browser Storage">
        <p>
          We may use local browser storage for preferences such as theme,
          language, and interface state. This keeps repeated study workflows
          faster and more consistent.
        </p>
      </InfoSection>

      <InfoSection title="Analytics And Advertising">
        <p>
          We do not currently use non-essential analytics cookies, advertising
          pixels, or cross-site tracking cookies.
        </p>
      </InfoSection>

      <InfoSection title="Questions">
        <p>
          Contact{" "}
          <a className="text-primary-300 hover:text-primary-200" href="mailto:contact@oghmanotes.ie">
            contact@oghmanotes.ie
          </a>{" "}
          for cookie or privacy questions.
        </p>
      </InfoSection>

      <InfoSection title="Last Updated">
        <p>May 26, 2026.</p>
      </InfoSection>
    </PublicInfoPage>
  );
}
