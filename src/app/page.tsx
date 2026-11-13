import {
  ArrowPathIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  CloudArrowDownIcon,
  DocumentMagnifyingGlassIcon,
  EnvelopeIcon,
  RectangleStackIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import Image from "next/image";
import Header from "@/components/header";
import Footer from "@/components/footer";
import ContactForm from "@/components/contact-form";
import FadeIn from "@/components/public/fade-in";
import FAQDisclosure from "@/components/public/faq-disclosure";
import { getServerI18n } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/translate";

export const metadata = {
  title: "Your whole semester, already loaded",
  description:
    "Connect Canvas once. Keep your available course material, files, deadlines, cited answers, notes, flashcards, and planning connected in one study workspace.",
  alternates: {
    canonical: "/",
  },
  keywords: [
    "Canvas study app",
    "Canvas LMS study planner",
    "AI study assistant for Canvas",
    "university revision planner",
    "lecture PDF flashcards",
    "cited answers from lecture notes",
    "NotebookLM alternative for students",
    "Canvas assignment tracker",
    "study app for University of Galway",
  ],
  openGraph: {
    title: "OghmaNotes - Your whole semester, already loaded",
    description:
      "Connect Canvas once. Keep your available course material, files, deadlines, cited answers, notes, flashcards, and planning connected in one study workspace.",
    url: "https://oghmanotes.ie",
    siteName: "OghmaNotes",
    type: "website",
    images: [
      {
        url: "/notes-workspace-ultrawide.png",
        width: 3440,
        height: 1440,
        alt: "OghmaNotes study workspace with course notes, files, and AI chat",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OghmaNotes - Your whole semester, already loaded",
    description:
      "Connect Canvas once. Keep your available course material, files, deadlines, cited answers, notes, flashcards, and planning connected in one study workspace.",
    images: ["/notes-workspace-ultrawide.png"],
  },
};

const homeStructuredData = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "OghmaNotes",
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    url: "https://oghmanotes.ie",
    image: "https://oghmanotes.ie/notes-workspace-ultrawide.png",
    description:
      "OghmaNotes is a Canvas-connected study workspace. It brings supported course material and deadlines into the same place as cited answers, notes, flashcards, and planning.",
    audience: {
      "@type": "EducationalAudience",
      educationalRole: "student",
    },
    offers: [
      {
        "@type": "Offer",
        name: "Free first import",
        price: "0",
        priceCurrency: "EUR",
        url: "https://oghmanotes.ie/pricing",
      },
    ],
    featureList: [
      "Canvas LMS course import",
      "Lecture PDF and document ingestion",
      "Cited answers from course material",
      "Flashcard generation and spaced repetition",
      "Deadline and assignment awareness",
      "Assignment and study planning",
      "Data export",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is OghmaNotes?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "OghmaNotes is a Canvas-connected study workspace. It brings supported course material and deadlines into the same place as cited answers, notes, flashcards, and planning.",
        },
      },
      {
        "@type": "Question",
        name: "How is this different from NotebookLM?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "NotebookLM is excellent for documents you upload manually. OghmaNotes is designed for the course you are actually taking: it starts from Canvas course material, deadlines, and available course context.",
        },
      },
      {
        "@type": "Question",
        name: "What does Canvas import include?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "OghmaNotes can import supported courses, files, assignments, and deadlines where your institution, account permissions, and Canvas APIs allow it. It does not currently promise grades or rubric feedback.",
        },
      },
    ],
  },
];

function getHomeFeatures(t: Translate) {
  return [
    {
      name: t("Course structure and files"),
      description: t("Keep supported courses, lectures, readings, and files together after import."),
      icon: DocumentMagnifyingGlassIcon,
    },
    {
      name: t("Assignments and deadlines"),
      description: t("See supported Canvas assignments and due dates beside your study work."),
      icon: CalendarDaysIcon,
    },
    {
      name: t("Cited answers"),
      description: t("Ask questions against indexed course material and follow citations back to sources."),
      icon: ChatBubbleLeftRightIcon,
    },
    {
      name: t("Notes"),
      description: t("Write and organise notes without separating them from the course they belong to."),
      icon: CloudArrowDownIcon,
    },
    {
      name: t("Flashcards and review"),
      description: t("Generate cards from indexed material and review them with spaced repetition."),
      icon: RectangleStackIcon,
    },
    {
      name: t("Study planning"),
      description: t("Plan assignments and study time around the course and deadlines in front of you."),
      icon: ArrowPathIcon,
    },
  ];
}

function getComparisonRows(t: Translate) {
  return [
    {
      tool: t("NotebookLM"),
      problem: t("Excellent for documents you upload, but you still have to gather and organise the sources."),
    },
    {
      tool: t("ChatGPT or Gemini"),
      problem: t("Powerful general assistants, but they do not automatically know your course, deadlines, or Canvas files."),
    },
    {
      tool: t("Quizlet or Anki"),
      problem: t("Useful for flashcards, but separate from your lectures, assignments, and deadlines."),
    },
    {
      tool: t("OghmaNotes"),
      problem: t("Starts from Canvas, so supported course structure, files, assignments, and deadlines stay connected to your notes, cited answers, flashcards, and planning."),
    },
  ];
}

function getHomeFAQs(t: Translate) {
  return [
    {
      question: t("What does Canvas import include?"),
      answer: t(
        "OghmaNotes can import supported courses, files, assignments, and deadlines where your institution, account permissions, and Canvas APIs allow it. Imports and indexing may take time, and it does not currently promise grades or rubric feedback.",
      ),
    },
    {
      question: t("Is OghmaNotes free?"),
      answer: t(
        "OghmaNotes is in closed beta and paid checkout is disabled. The free first import and semester and academic-year prices are provisional planning ranges.",
      ),
    },
    {
      question: t("Is OghmaNotes affiliated with University of Galway?"),
      answer: t(
        "No. OghmaNotes is built by students at University of Galway, but it is an independent beta product and not an official University of Galway or Canvas service. AI answers and generated study material can be wrong, so check important work against course sources and official guidance.",
      ),
    },
  ];
}

function HeroMockup() {
  return (
    <div className="relative mt-16 sm:mt-24 rounded-radius-2xl border border-border bg-surface shadow-float overflow-hidden">
      <Image
        src="/notes-workspace-ultrawide.png"
        alt="OghmaNotes workspace with course files, notes, and study chat"
        width={3440}
        height={1440}
        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1280px"
        className="w-full h-auto block"
        priority
      />
    </div>
  );
}

export default async function Home() {
  const { t } = await getServerI18n();
  const features = getHomeFeatures(t);
  const faqs = getHomeFAQs(t);
  const comparisonRows = getComparisonRows(t);

  return (
    <div className="bg-landing">
      <Header />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(homeStructuredData),
        }}
      />

      <div className="relative pt-14">
        <div className="py-24 sm:py-32 lg:pb-40">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <FadeIn>
                <p className="type-eyebrow font-mono text-text-tertiary">
                  {t("Canvas-connected study system")}
                </p>
                <h1 className="type-display mx-auto mt-6 max-w-5xl text-text">
                  {t("Your whole semester, already loaded.")}
                </h1>
              </FadeIn>
              <FadeIn delay={0.1}>
                <p className="type-lead mx-auto mt-8 text-text-secondary">
                  {t(
                    "Connect Canvas once. Keep your available course material, files, deadlines, cited answers, notes, flashcards, and planning connected in one study workspace.",
                  )}
                </p>
              </FadeIn>
              <FadeIn delay={0.2}>
                <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <a
                    href="/contact#contact-form"
                    className="rounded-radius-md bg-action px-5 py-3 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {t("Join the beta")}
                  </a>
                  <a
                    href="#notebooklm"
                    className="text-sm/6 font-semibold text-accent transition-colors hover:text-accent-hover"
                  >
                    {t("Compare with NotebookLM")} <span aria-hidden="true">&rarr;</span>
                  </a>
                </div>
              </FadeIn>
            </div>

            <FadeIn delay={0.3}>
              <HeroMockup />
            </FadeIn>
          </div>
        </div>
      </div>

      <div id="features" className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <FadeIn>
            <h2 className="type-eyebrow text-center font-mono text-text-tertiary">
              {t("What changes once Canvas is connected")}
            </h2>
            <p className="type-supporting-title mx-auto mt-4 max-w-4xl text-center text-text">
              {t("The study work starts already organised.")}
            </p>
          </FadeIn>
          <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3">
            {features.map((feature, i) => (
              <FadeIn key={feature.name} delay={i * 0.05}>
                <dl className="h-full rounded-radius-xl border border-border bg-surface p-6 transition-colors duration-200 hover:border-border-strong">
                  <dt>
                    <div className="mb-4 w-fit rounded-radius-md border border-border bg-surface p-2">
                      <feature.icon
                        aria-hidden="true"
                        className="size-5 text-accent"
                      />
                    </div>
                    <span className="type-card-title text-text">
                      {feature.name}
                    </span>
                  </dt>
                  <dd className="type-body mt-3 text-text-secondary">
                    {feature.description}
                  </dd>
                </dl>
              </FadeIn>
            ))}
          </div>
        </div>
      </div>

      <div id="notebooklm" className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <FadeIn>
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="type-eyebrow font-mono text-text-tertiary">
                {t("Why not just use NotebookLM?")}
              </h2>
              <p className="type-supporting-title mt-4 text-text">
                {t("NotebookLM is great for documents you upload.")}
              </p>
              <p className="type-lead mx-auto mt-6 text-text-secondary">
                {t(
                  "Document tools begin after you gather and upload sources. OghmaNotes begins with the Canvas course you already have.",
                )}
              </p>
            </div>
          </FadeIn>
          <div className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-radius-2xl border border-border bg-surface">
            {comparisonRows.map((row, index) => (
              <div
                key={row.tool}
                className={`grid gap-1 px-6 py-4 transition-colors sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-5 ${
                  index > 0 ? "border-t border-border" : ""
                } ${row.tool === t("OghmaNotes") ? "bg-accent-soft" : ""}`}
              >
                <div className="type-card-title text-text">
                  {row.tool}
                </div>
                <div className="type-body text-text-secondary">
                  {row.problem}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <FadeIn>
              <div>
                <h2 className="type-supporting-title text-text">
                  {t("Built by students. Clear about the beta.")}
                </h2>
                <p className="type-body mt-4 max-w-xl text-text-secondary">
                  {t(
                    "OghmaNotes is built by students at University of Galway. It is independent, early, and focused on making Canvas less painful during real assignment and exam weeks.",
                  )}
                </p>
              </div>
            </FadeIn>
            <FadeIn delay={0.1}>
              <div className="rounded-radius-xl border border-border bg-surface p-6">
                <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {[
                    t("Free first import before upgrade pressure"),
                    t("Export workflows so your notes are not trapped"),
                    t("Canvas data access depends on your permissions"),
                    t("Not an official University of Galway service"),
                  ].map((item) => (
                    <div key={item} className="flex gap-3">
                      <CheckCircleIcon
                        aria-hidden="true"
                        className="mt-0.5 size-5 flex-none text-accent"
                      />
                      <p className="text-base/6 text-text-secondary">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </div>

      <div id="contact" className="relative border-t border-border">
        <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-2">
          <div className="relative px-6 pt-24 pb-20 sm:pt-32 lg:static lg:px-8 lg:py-48">
            <div className="mx-auto max-w-xl lg:mx-0 lg:max-w-lg">
              <FadeIn>
                <h2 className="type-supporting-title text-text">
                  {t("Beta access, feedback, or data questions")}
                </h2>
                <p className="type-lead mt-6 text-text-secondary">
                  {t(
                    "Talk to the OghmaNotes team about beta access, Canvas import support, pricing, privacy, or data export requests.",
                  )}
                </p>
              </FadeIn>
              <dl className="mt-10 space-y-4 text-base/7 text-text-secondary">
                <div className="flex gap-x-4">
                  <dt className="flex-none">
                    <span className="sr-only">{t("Email")}</span>
                    <EnvelopeIcon
                      aria-hidden="true"
                      className="h-7 w-6 text-text-tertiary"
                    />
                  </dt>
                  <dd>
                    <a
                      href="mailto:contact@oghmanotes.ie"
                      className="transition-colors hover:text-text"
                    >
                      contact@oghmanotes.ie
                    </a>
                  </dd>
                </div>
                <div className="flex gap-x-4">
                  <dt className="flex-none">
                    <span className="sr-only">{t("Privacy")}</span>
                    <ShieldCheckIcon
                      aria-hidden="true"
                      className="h-7 w-6 text-text-tertiary"
                    />
                  </dt>
                  <dd>
                    {t(
                      "Built by students at University of Galway; independent from the university and clear about data access.",
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="px-6 pt-20 pb-24 sm:pb-32 lg:px-8 lg:py-48">
            <ContactForm source="home" />
          </div>
        </div>
      </div>

      <div>
        <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8 lg:py-40">
          <div className="mx-auto max-w-4xl">
            <FadeIn>
              <h2 className="type-section-title text-text">
                {t("Frequently asked questions")}
              </h2>
            </FadeIn>
            <FAQDisclosure faqs={faqs} />
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
