import ContactForm from "@/components/contact-form";
import PublicInfoPage, { InfoSection } from "@/components/public-info-page";

export const metadata = {
  title: "Contact",
  description:
    "Contact OghmaNotes for beta access, support, billing, student groups, partnerships, or campus pilot requests.",
  alternates: {
    canonical: "/contact",
  },
};

export default function ContactPage() {
  return (
    <PublicInfoPage
      eyebrow="Contact"
      title="Contact OghmaNotes"
      description="For beta access, support, billing, student groups, partnerships, or campus pilot requests, use the form or email us directly."
    >
      <InfoSection title="Email">
        <p>
          <a className="text-primary-300 hover:text-primary-200" href="mailto:contact@oghmanotes.ie">
            contact@oghmanotes.ie
          </a>
        </p>
      </InfoSection>

      <InfoSection title="Useful Details To Include">
        <ul className="list-disc space-y-2 pl-6">
          <li>Your role: student, lecturer, university staff, partner, or press.</li>
          <li>Your university or organization, if relevant.</li>
          <li>Whether you need beta access, support, billing help, a student group setup, or a campus pilot.</li>
          <li>Any deadline or launch date we should know about.</li>
        </ul>
      </InfoSection>

      <section>
        <ContactForm source="contact" />
      </section>
    </PublicInfoPage>
  );
}
