import PublicInfoPage, { InfoSection } from "@/components/public-info-page";

export const metadata = {
  title: "Terms of Service",
  description: "The terms for using OghmaNotes.",
};

export default function TermsPage() {
  return (
    <PublicInfoPage
      eyebrow="Terms"
      title="Terms of Service"
      description="These terms cover use of OghmaNotes during the early launch period. The product is improving quickly, and some features may change as we learn from real usage."
    >
      <InfoSection title="Using OghmaNotes">
        <p>
          You are responsible for your account, the files you upload, and the
          Canvas connection you choose to authorize. Do not upload material you
          do not have the right to store or process. Canvas access depends on
          your institution's settings and the permissions available to your
          account.
        </p>
      </InfoSection>

      <InfoSection title="Early Service Notice">
        <p>
          OghmaNotes is an early product. We maintain backups and operate the
          service carefully, but downtime, bugs, data loss, and feature changes
          are possible during launch.
        </p>
      </InfoSection>

      <InfoSection title="AI Output">
        <p>
          AI features can be wrong. Treat generated summaries, answers, quiz
          questions, and study advice as study support, not authoritative
          academic guidance. Always check important answers against original
          course material, assignment briefs, rubrics, and lecturer guidance.
        </p>
      </InfoSection>

      <InfoSection title="Billing">
        <p>
          Paid plans and checkout may change during launch. If pricing changes,
          existing users will be told before renewal terms change.
        </p>
      </InfoSection>

      <InfoSection title="Contact">
        <p>
          Questions about these terms can be sent to{" "}
          <a className="text-primary-300 hover:text-primary-200" href="mailto:contact@oghmanotes.ie">
            contact@oghmanotes.ie
          </a>
          .
        </p>
      </InfoSection>

      <InfoSection title="Last Updated">
        <p>May 26, 2026.</p>
      </InfoSection>
    </PublicInfoPage>
  );
}
