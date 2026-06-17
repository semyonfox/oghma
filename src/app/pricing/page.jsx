import Link from "next/link";
import PublicInfoPage, { InfoSection } from "@/components/public-info-page";

export const metadata = {
  title: "Pricing",
  description: "OghmaNotes launch pricing.",
};

const tiers = [
  {
    name: "Free",
    price: "EUR 0",
    description: "Basic notes, study tools, and limited AI usage while you try the product.",
  },
  {
    name: "Standard",
    price: "EUR 10 / month",
    description: "Full study workflow for active students: imports, semantic search, chat, quizzes, and flashcards.",
  },
  {
    name: "Premium",
    price: "EUR 18 / month",
    description: "Higher usage limits for students with heavier course loads and larger document libraries.",
  },
];

export default function PricingPage() {
  return (
    <PublicInfoPage
      eyebrow="Pricing"
      title="Simple Launch Pricing"
      description="Start free, then upgrade when OghmaNotes is part of your study routine. Checkout is being rolled out during the launch period."
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
          Paid checkout is not required for the current closed beta. Pricing may
          be adjusted before public launch, and existing users will be told
          before any renewal changes.
        </p>
      </InfoSection>

      <InfoSection title="Questions">
        <p>
          For beta access or billing questions, contact{" "}
          <Link className="text-primary-300 hover:text-primary-200" href="/contact">
            the team
          </Link>
          .
        </p>
      </InfoSection>
    </PublicInfoPage>
  );
}
