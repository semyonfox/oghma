import ContactForm from "@/components/contact-form";
import PublicInfoPage, { InfoSection } from "@/components/public-info-page";

export const metadata = {
  title: "Contact",
  description: "Contact the OghmaNotes team.",
};

export default function ContactPage() {
  return (
    <PublicInfoPage
      eyebrow="Contact"
      title="Contact OghmaNotes"
      description="For support, data requests, beta access, or billing questions, use the form or email us directly."
    >
      <InfoSection title="Email">
        <p>
          <a className="text-primary-300 hover:text-primary-200" href="mailto:contact@oghmanotes.ie">
            contact@oghmanotes.ie
          </a>
        </p>
      </InfoSection>

      <section>
        <ContactForm />
      </section>
    </PublicInfoPage>
  );
}
