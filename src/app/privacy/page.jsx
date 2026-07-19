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
          selected course material. Canvas tokens are treated as sensitive
          account data and are kept server-side.
        </p>
      </InfoSection>

      <InfoSection title="How We Use It">
        <p>
          We use your data to provide Canvas import, notes, cited answers,
          search, quiz generation, flashcards, revision workflows, exports, and
          account support. We do not sell student data.
        </p>
      </InfoSection>

      <InfoSection title="Privacy-First Analytics">
        <p>
          We use limited first-party, aggregate-oriented events to understand
          public-page acquisition and account activation. We do not use
          analytics cookies, advertising pixels, session replay, anonymous
          browser identifiers, raw IP addresses, query strings, or user-agent
          fingerprints or browser storage. Campaign attribution is attached only
          to the event generated from the current page URL, raw events are
          retained for up to 30 days, and Do Not Track or Global Privacy Control
          disables this collection.
        </p>
      </InfoSection>

      <InfoSection title="AI Processing">
        <p>
          When you use AI features, relevant note or file excerpts may be sent
          to configured AI providers so the feature can respond. Provider access
          is limited to the content required for the request. OghmaNotes does
          not use student notes, Canvas files, or uploaded files to train its own
          general-purpose AI model.
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
        <p>July 11, 2026.</p>
      </InfoSection>
    </PublicInfoPage>
  );
}
