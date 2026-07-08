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

export const metadata = {
  title: "Your whole semester, already loaded",
  description:
    "Connect Canvas once. OghmaNotes pulls in lectures, deadlines, and course material, then turns them into cited answers, flashcards, and exam revision planning.",
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
      "Connect Canvas once and turn your actual lectures, deadlines, and course material into cited answers, flashcards, and a revision plan.",
    url: "https://oghmanotes.ie",
    siteName: "OghmaNotes",
    type: "website",
    images: [
      {
        url: "/notes-screenshot.png",
        width: 1440,
        height: 900,
        alt: "OghmaNotes study workspace with course notes, files, and AI chat",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OghmaNotes - Your whole semester, already loaded",
    description:
      "A Canvas-connected study system that imports course material and turns it into cited answers, flashcards, and revision planning.",
    images: ["/notes-screenshot.png"],
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
    image: "https://oghmanotes.ie/notes-screenshot.png",
    description:
      "OghmaNotes is a Canvas-connected study system for university students. It imports course material and deadlines, then helps students ask cited questions, generate flashcards, and plan revision around exams.",
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
      "Exam-focused revision planning",
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
          text: "OghmaNotes is a Canvas-connected study system that imports university course material, deadlines, and available feedback, then helps students study with cited answers, flashcards, and revision planning.",
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
          text: "OghmaNotes is built to import Canvas courses, files, assignments, and deadline workflows. Grades, rubric feedback, and other course details depend on the permissions and data your Canvas account exposes.",
        },
      },
    ],
  },
];

function getHomeFeatures(t) {
  return [
    {
      name: t("Ask your lectures anything"),
      description: t(
        "Get answers grounded in your actual slides, readings, and notes, with citations back to the material OghmaNotes can index.",
      ),
      icon: ChatBubbleLeftRightIcon,
    },
    {
      name: t("Flashcards that schedule themselves"),
      description: t(
        "Turn course material into active-recall cards and review them on a spaced schedule instead of rebuilding decks by hand.",
      ),
      icon: RectangleStackIcon,
    },
    {
      name: t("Never lose a deadline again"),
      description: t(
        "Bring Canvas assignments and due dates into the same workspace as your notes, files, revision, and study questions.",
      ),
      icon: CalendarDaysIcon,
    },
    {
      name: t("Reads messy scanned slides"),
      description: t(
        "Import lecture PDFs, including scanned or image-heavy slides, and let background extraction make them searchable where possible.",
      ),
      icon: DocumentMagnifyingGlassIcon,
    },
    {
      name: t("Revision built around exams"),
      description: t(
        "Plan what to review next from the modules and deadlines in front of you, instead of guessing what matters during exam season.",
      ),
      icon: ArrowPathIcon,
    },
    {
      name: t("Export everything, no lock-in"),
      description: t(
        "Keep control of your notes and study material with export workflows, clear account controls, and transparent beta limits.",
      ),
      icon: CloudArrowDownIcon,
    },
  ];
}

function getComparisonRows(t) {
  return [
    {
      tool: t("NotebookLM"),
      problem: t("Excellent for documents you upload, but you still have to feed and organise it manually."),
    },
    {
      tool: t("ChatGPT or Gemini"),
      problem: t("Powerful general assistants, but they do not automatically know your course, deadlines, or Canvas files."),
    },
    {
      tool: t("Quizlet or Anki"),
      problem: t("Useful for flashcards, but disconnected from your lectures, assignments, and exam calendar."),
    },
    {
      tool: t("OghmaNotes"),
      problem: t("Starts from Canvas so your lectures, deadlines, files, and available feedback are already part of the study system."),
    },
  ];
}

function getHomeFAQs(t) {
  return [
    {
      question: t("What is OghmaNotes?"),
      answer: t(
        "OghmaNotes is a study system that assembles itself from Canvas. Connect once, import your course material, and use it for cited answers, flashcards, deadlines, and revision planning.",
      ),
    },
    {
      question: t("How is this different from NotebookLM?"),
      answer: t(
        "NotebookLM is great for documents you upload. OghmaNotes is for the course you are actually taking: it starts with Canvas files, assignments, deadlines, and available course context so there is less setup.",
      ),
    },
    {
      question: t("What does Canvas import include?"),
      answer: t(
        "OghmaNotes is built to import Canvas courses, files, assignments, and deadline workflows. Grades, rubric feedback, and other course details depend on the permissions and data your Canvas account exposes.",
      ),
    },
    {
      question: t("Do I have to pay before seeing it work?"),
      answer: t(
        "No. The intended launch flow is a free first import or one-module import so you can see your semester appear before deciding whether to upgrade.",
      ),
    },
    {
      question: t("Can OghmaNotes make flashcards and quizzes?"),
      answer: t(
        "Yes. It can generate study questions and flashcards from imported material, then help you review them with spaced repetition instead of manually building decks from scratch.",
      ),
    },
    {
      question: t("Is OghmaNotes affiliated with University of Galway?"),
      answer: t(
        "No. OghmaNotes is built by students at University of Galway, but it is an independent product and not an official university service.",
      ),
    },
  ];
}

function HeroMockup() {
  return (
    <div className="relative mt-16 sm:mt-24 rounded-radius-2xl ring-1 ring-border-subtle shadow-2xl overflow-hidden">
      <Image
        src="/notes-screenshot.png"
        alt="OghmaNotes workspace with course files, notes, and study chat"
        width={1440}
        height={900}
        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1280px"
        className="w-full h-auto block"
        priority
      />
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{
          height: "45%",
          background:
            "linear-gradient(to top, var(--color-background) 0%, var(--color-background) 15%, transparent 100%)",
        }}
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

      <div className="relative isolate pt-14">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
        >
          <div
            style={{
              clipPath:
                "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
            }}
            className="relative left-[calc(50%-11rem)] aspect-1155/678 w-144.5 -translate-x-1/2 rotate-30 bg-linear-to-tr from-primary-500/25 to-primary-400/10 opacity-40 sm:left-[calc(50%-30rem)] sm:w-288.75"
          />
        </div>
        <div className="py-24 sm:py-32 lg:pb-40">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <FadeIn>
                <p className="text-sm/6 font-semibold text-primary-400">
                  {t("Canvas-connected study system")}
                </p>
                <h1 className="mt-4 font-serif text-5xl font-semibold tracking-tight text-balance text-text sm:text-7xl">
                  {t("Your whole semester, already loaded.")}
                </h1>
              </FadeIn>
              <FadeIn delay={0.1}>
                <p className="mt-8 text-lg font-medium text-pretty text-text-secondary sm:text-xl/8">
                  {t(
                    "Connect Canvas once. OghmaNotes pulls in your lectures, deadlines and course material, then turns them into cited answers, flashcards and an exam revision plan.",
                  )}
                </p>
              </FadeIn>
              <FadeIn delay={0.2}>
                <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <a
                    href="/register?utm_source=homepage&utm_medium=hero_cta&utm_campaign=free_canvas_import"
                    className="rounded-radius-md bg-primary-600 px-5 py-3 text-sm font-semibold text-text-on-primary shadow-xs transition-colors hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                  >
                    {t("Connect Canvas free")}
                  </a>
                  <a
                    href="#notebooklm"
                    className="text-sm/6 font-semibold text-text transition-colors hover:text-primary-400"
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
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-[calc(100%-13rem)] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[calc(100%-30rem)]"
        >
          <div
            style={{
              clipPath:
                "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
            }}
            className="relative left-[calc(50%+3rem)] aspect-1155/678 w-144.5 -translate-x-1/2 bg-linear-to-tr from-primary-500/25 to-primary-400/10 opacity-40 sm:left-[calc(50%+36rem)] sm:w-288.75"
          />
        </div>
      </div>

      <div id="features" className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <FadeIn>
            <h2 className="text-center text-base/7 font-semibold text-primary-400">
              {t("What changes once Canvas is connected")}
            </h2>
            <p className="mx-auto mt-2 max-w-3xl text-center font-serif text-4xl font-semibold tracking-tight text-balance text-text sm:text-5xl">
              {t("The study work starts already organised.")}
            </p>
          </FadeIn>
          <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3">
            {features.map((feature, i) => (
              <FadeIn key={feature.name} delay={i * 0.05}>
                <dl className="h-full rounded-radius-xl bg-surface border border-border-subtle p-6 transition-colors duration-200 hover:border-border">
                  <dt>
                    <div className="bg-primary-500/10 rounded-radius-lg p-2 w-fit mb-4">
                      <feature.icon
                        aria-hidden="true"
                        className="size-8 text-primary-400"
                      />
                    </div>
                    <span className="font-serif text-lg font-semibold text-text">
                      {feature.name}
                    </span>
                  </dt>
                  <dd className="mt-2 text-base/7 text-text-secondary">
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
              <h2 className="text-base/7 font-semibold text-primary-400">
                {t("Why not just use NotebookLM?")}
              </h2>
              <p className="mt-2 font-serif text-4xl font-semibold tracking-tight text-balance text-text sm:text-5xl">
                {t("NotebookLM is great for documents you upload.")}
              </p>
              <p className="mt-6 text-lg/8 text-text-secondary">
                {t(
                  "OghmaNotes is for the course you are actually taking. It starts from Canvas, so lectures, deadlines and available course context are already part of the workspace.",
                )}
              </p>
            </div>
          </FadeIn>
          <div className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-radius-xl border border-border-subtle bg-surface">
            {comparisonRows.map((row, index) => (
              <div
                key={row.tool}
                className={`grid gap-4 p-6 sm:grid-cols-[12rem_1fr] ${
                  index > 0 ? "border-t border-border-subtle" : ""
                }`}
              >
                <div className="font-serif text-lg font-semibold text-text">
                  {row.tool}
                </div>
                <div className="text-base/7 text-text-secondary">
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
                <h2 className="font-serif text-4xl font-semibold tracking-tight text-text sm:text-5xl">
                  {t("Built by students. Clear about the beta.")}
                </h2>
                <p className="mt-6 text-lg/8 text-text-secondary">
                  {t(
                    "OghmaNotes is built by students at University of Galway. It is independent, early, and focused on making Canvas less painful during real assignment and exam weeks.",
                  )}
                </p>
              </div>
            </FadeIn>
            <FadeIn delay={0.1}>
              <div className="rounded-radius-xl border border-border-subtle bg-surface p-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  {[
                    t("Free first import before upgrade pressure"),
                    t("Export workflows so your notes are not trapped"),
                    t("Canvas data access depends on your permissions"),
                    t("Not an official University of Galway service"),
                  ].map((item) => (
                    <div key={item} className="flex gap-3">
                      <CheckCircleIcon
                        aria-hidden="true"
                        className="mt-1 size-5 flex-none text-primary-400"
                      />
                      <p className="text-sm/6 text-text-secondary">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </div>

      <div className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
          <div className="relative isolate overflow-hidden bg-primary-600 px-6 py-24 after:pointer-events-none after:absolute after:inset-0 after:inset-ring after:inset-ring-white/15 sm:rounded-radius-2xl sm:px-24 after:sm:rounded-radius-2xl xl:py-32">
            <FadeIn>
              <h2 className="mx-auto max-w-3xl text-center font-serif text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                {t("See your semester assemble itself.")}
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-center text-lg text-primary-100">
                {t(
                  "Start with a free Canvas import. If OghmaNotes does not make your course feel easier to study, do not upgrade.",
                )}
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href="/register?utm_source=homepage&utm_medium=midpage_cta&utm_campaign=free_canvas_import"
                  className="rounded-radius-md bg-white px-6 py-3 text-sm font-semibold text-primary-700 shadow-xs transition-colors hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {t("Connect Canvas free")}
                </a>
                <a
                  href="/pricing?utm_source=homepage&utm_medium=midpage_cta&utm_campaign=semester_pricing"
                  className="text-sm/6 font-semibold text-white"
                >
                  {t("View semester pricing")} <span aria-hidden="true">&rarr;</span>
                </a>
              </div>
            </FadeIn>
            <svg
              viewBox="0 0 1024 1024"
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 -z-10 size-256 -translate-x-1/2"
            >
              <circle
                r={512}
                cx={512}
                cy={512}
                fill="url(#cta-gradient)"
                fillOpacity="0.5"
              />
              <defs>
                <radialGradient
                  r={1}
                  cx={0}
                  cy={0}
                  id="cta-gradient"
                  gradientUnits="userSpaceOnUse"
                  gradientTransform="translate(512 512) rotate(90) scale(512)"
                >
                  <stop stopColor="#a5b4fc" />
                  <stop offset={1} stopColor="#6366f1" stopOpacity={0} />
                </radialGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      <div id="contact" className="relative isolate">
        <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-2">
          <div className="relative px-6 pt-24 pb-20 sm:pt-32 lg:static lg:px-8 lg:py-48">
            <div className="mx-auto max-w-xl lg:mx-0 lg:max-w-lg">
              <FadeIn>
                <h2 className="font-serif text-4xl font-semibold tracking-tight text-pretty text-text sm:text-5xl">
                  {t("Beta access, feedback, or data questions")}
                </h2>
                <p className="mt-6 text-lg/8 text-text-secondary">
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
            <ContactForm />
          </div>
        </div>
      </div>

      <div>
        <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8 lg:py-40">
          <div className="mx-auto max-w-4xl">
            <FadeIn>
              <h2 className="font-serif text-4xl font-semibold tracking-tight text-text sm:text-5xl">
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
