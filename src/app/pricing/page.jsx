import Link from "next/link";
import PublicInfoPage, { InfoSection } from "@/components/public-info-page";

export const metadata = {
  title: "Semester Pricing",
  description:
    "OghmaNotes launch pricing for students: free first import during beta, then semester or annual plans for Canvas-connected study.",
  alternates: {
    canonical: "/pricing",
  },
};

const tiers = [
  {
    name: "Free first import",
    price: "EUR 0",
    description:
      "Try the Canvas-connected workflow before paying. Launch limits may include one module, a page cap, and a one-time import while we protect OCR and AI costs.",
  },
  {
    name: "Semester",
    price: "Around EUR 39-49",
    description:
      "Built for assignment and exam season: current modules, Canvas sync, cited answers, flashcards, revision planning, and practical import allowances.",
  },
  {
    name: "Academic year",
    price: "Around EUR 79-89",
    description:
      "For students who want the whole year organised without thinking about monthly SaaS billing. Annual checkout will stay disabled until public pricing is final.",
  },
];

export default function PricingPage() {
  return (
    <PublicInfoPage
      eyebrow="Pricing"
      title="Pricing built around semesters"
      description="Students do not think in SaaS billing cycles. OghmaNotes starts with a limited free import, then prices around the academic term and the real cost of Canvas OCR, AI, storage, and sync."
    >
      <section className="grid gap-5 md:grid-cols-3">
        {tiers.map((tier) => (
          <article
            key={tier.name}
            className="rounded-lg border border-border-subtle bg-surface/70 p-5"
          >
            <h2 className="text-xl font-semibold text-text">{tier.name}</h2>
            <p className="mt-3 text-2xl font-semibold text-primary-300">
              {tier.price}
            </p>
            <p className="mt-4 text-sm leading-6 text-text-secondary">
              {tier.description}
            </p>
          </article>
        ))}
      </section>

      <InfoSection title="Launch Status">
        <p>
          Paid checkout is not required for the current closed beta. The exact
          free import allowance, semester price, and annual price may be adjusted
          before public launch. Existing beta users will be told before any
          renewal or plan changes.
        </p>
      </InfoSection>

      <InfoSection title="Why Canvas import has limits">
        <p>
          OghmaNotes has to process real lecture files, scanned slides, and PDFs.
          Small imports can be quick; large Canvas histories may need background
          OCR/indexing and queue time. Limits keep the free tier honest while
          still letting students see their course material assemble before
          upgrading.
        </p>
      </InfoSection>

      <InfoSection title="Questions">
        <p>
          For beta access, billing questions, or student group pilots, contact{" "}
          <Link
            className="text-primary-300 hover:text-primary-200"
            href="/contact?utm_source=pricing&utm_medium=cta&utm_campaign=launch_beta"
          >
            the team
          </Link>
          .
        </p>
      </InfoSection>
    </PublicInfoPage>
  );
}
