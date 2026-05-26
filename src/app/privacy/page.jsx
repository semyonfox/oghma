import PublicInfoPage, { InfoSection } from "@/components/public-info-page";

export const metadata = {
  title: "Privacy Policy",
  description: "How OghmaNotes collects, uses, and protects student data.",
};

export default function PrivacyPage() {
  return (
    <PublicInfoPage
      eyebrow="Privacy"
      title="Privacy Policy"
      description="OghmaNotes is built for students. We collect only the data needed to run your account, sync your study material, and provide the features you choose to use."
    >
      <InfoSection title="What We Collect">
        <p>
          We store account details, authentication state, notes, uploaded files,
          Canvas import metadata, study activity, settings, and support messages
          you send us. If you connect Canvas, we store the token needed to sync
          selected course material.
        </p>
      </InfoSection>

      <InfoSection title="How We Use It">
        <p>
          We use your data to provide notes, search, chat, quiz generation,
          flashcards, imports, exports, and account support. We do not sell
          student data.
        </p>
      </InfoSection>

      <InfoSection title="AI Processing">
        <p>
          When you use AI features, relevant note or file excerpts may be sent
          to configured AI providers so the feature can respond. Provider access
          is limited to the content required for the request.
        </p>
      </InfoSection>

      <InfoSection title="Your Rights">
        <p>
          You can request access, correction, export, or deletion of your data.
          Account deletion starts a 30-day grace period before permanent
          removal. Contact us at{" "}
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
