import {
  ArrowPathIcon,
  BuildingOffice2Icon,
  CloudArrowUpIcon,
  Cog6ToothIcon,
  EnvelopeIcon,
  FingerPrintIcon,
  LockClosedIcon,
  PhoneIcon,
  ServerIcon,
} from "@heroicons/react/24/outline";
import Image from "next/image";
import Header from "@/components/header";
import Footer from "@/components/footer";
import TestimonialSection from "@/components/testimonial-section";
import ContactForm from "@/components/contact-form";
import FadeIn from "@/components/public/fade-in";
import FAQDisclosure from "@/components/public/faq-disclosure";
import { getServerI18n } from "@/lib/i18n/server";

function getHomeFeatures(t) {
  return [
    {
      name: t("Rich Markdown Editor"),
      description: t(
        "Write beautiful, formatted notes with live preview, syntax highlighting, and seamless organization.",
      ),
      icon: Cog6ToothIcon,
    },
    {
      name: t("AI-Powered Insights"),
      description: t(
        "Get intelligent summaries, key concepts, and study questions generated automatically from your notes.",
      ),
      icon: CloudArrowUpIcon,
    },
    {
      name: t("Canvas Integration"),
      description: t(
        "Seamlessly sync notes from your Canvas courses and keep all study materials in one place.",
      ),
      icon: ArrowPathIcon,
    },
    {
      name: t("Secure Cloud Storage"),
      description: t(
        "Your notes are safely stored and accessible from any device with enterprise-grade encryption.",
      ),
      icon: LockClosedIcon,
    },
    {
      name: t("Collaborative Learning"),
      description: t(
        "Share notes with classmates, collaborate on study materials, and learn together in real-time.",
      ),
      icon: FingerPrintIcon,
    },
    {
      name: t("Multi-User Support"),
      description: t(
        "Built for university teams with secure authentication, role-based access, and session management.",
      ),
      icon: ServerIcon,
    },
  ];
}

function getHomeFAQs(t) {
  return [
    {
      question: t("What is OghmaNotes?"),
      answer: t(
        "OghmaNotes is a RAG-powered learning platform that combines Markdown notes with semantic search and AI. Upload PDFs from lectures, ask questions about your materials with cited answers, and get adaptive quizzes and flashcards personalized to your learning pace.",
      ),
    },
    {
      question: t("How does the RAG chat work?"),
      answer: t(
        "Upload any PDF or document. The system extracts text, chunks it semantically, and stores embeddings in our vector database. When you ask a question, it retrieves relevant material and generates answers with direct citations so you know where information came from.",
      ),
    },
    {
      question: t("Can I integrate Canvas deadlines?"),
      answer: t(
        "Yes. Connect your Canvas account and OghmaNotes automatically syncs your courses, assignments, and deadlines daily. All your course materials are organized in one place with integrated calendar views.",
      ),
    },
    {
      question: t("What are spaced repetition flashcards?"),
      answer: t(
        "We use the SM-2 algorithm to schedule flashcard reviews at optimal intervals. The system learns which cards you struggle with and prioritizes them, scientifically proven to improve long-term retention.",
      ),
    },
    {
      question: t("Do you generate quizzes automatically?"),
      answer: t(
        "Absolutely. OghmaNotes generates adaptive quizzes from your notes and materials. Questions scale in difficulty based on your performance, giving you targeted practice on weak areas.",
      ),
    },
    {
      question: t("Can I access my notes offline?"),
      answer: t(
        "Yes! OghmaNotes is a Progressive Web App. Write and edit notes offline, and they sync automatically when you reconnect. Perfect for lecture halls and studying anywhere.",
      ),
    },
  ];
}

// screenshot of the actual notes editor
function HeroMockup() {
  return (
    <div className="relative mt-16 sm:mt-24 rounded-radius-2xl ring-1 ring-border-subtle shadow-2xl overflow-hidden">
      <Image
        src="/notes-screenshot.png"
        alt="OghmaNotes editor with file tree, rich text editing, and AI chat"
        width={1440}
        height={900}
        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1280px"
        className="w-full h-auto block"
        priority
      />
      {/* smooth fade-out blending into the page */}
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

  return (
    <div className="bg-landing">
      <Header />

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
            <div className="mx-auto max-w-2xl text-center">
              <FadeIn>
                <h1 className="font-serif text-5xl font-semibold tracking-tight text-balance text-text sm:text-7xl">
                  {t("OghmaNotes: Semantic Notes & RAG Chat")}
                </h1>
              </FadeIn>
              <FadeIn delay={0.1}>
                <p className="mt-8 text-lg font-medium text-pretty text-text-secondary sm:text-xl/8">
                  {t(
                    "Upload PDFs. Ask questions with cited answers. Generate adaptive quizzes. Master your materials with spaced-repetition flashcards and Canvas sync. Offline-first learning, designed for busy students.",
                  )}
                </p>
              </FadeIn>
              <FadeIn delay={0.2}>
                <div className="mt-10 flex items-center justify-center gap-x-6">
                  <a
                    href="/register"
                    className="rounded-radius-md bg-primary-600 px-3.5 py-2.5 text-sm font-semibold text-text-on-primary shadow-xs transition-colors hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                  >
                    {t("Get started free")}
                  </a>
                  <a
                    href="#features"
                    className="text-sm/6 font-semibold text-text transition-colors hover:text-primary-400"
                  >
                    {t("Learn more")} <span aria-hidden="true">&rarr;</span>
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

      {/* Features Section */}
      <div id="features" className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <FadeIn>
            <h2 className="text-center text-base/7 font-semibold text-primary-400">
              {t("Core Features")}
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-center font-serif text-4xl font-semibold tracking-tight text-balance text-text sm:text-5xl">
              {t("Everything you need for RAG-powered learning")}
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

      {/* Testimonials Section */}
      <TestimonialSection />

      {/* CTA Section */}
      <div className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
          <div className="relative isolate overflow-hidden bg-primary-600 px-6 py-24 after:pointer-events-none after:absolute after:inset-0 after:inset-ring after:inset-ring-white/15 sm:rounded-radius-2xl sm:px-24 after:sm:rounded-radius-2xl xl:py-32">
            <FadeIn>
              <h2 className="mx-auto max-w-3xl text-center font-serif text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                {t("Ready to master your materials?")}
              </h2>
              <p className="mx-auto mt-6 max-w-lg text-center text-lg text-primary-100">
                {t(
                  "Start with OghmaNotes today. Semantic search, RAG chat, adaptive quizzes, and spaced repetition—everything for RAG-powered learning.",
                )}
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href="/register"
                  className="rounded-radius-md bg-white px-6 py-3 text-sm font-semibold text-primary-700 shadow-xs transition-colors hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {t("Get started free")}
                </a>
                <a href="/login" className="text-sm/6 font-semibold text-white">
                  {t("Sign in")} <span aria-hidden="true">&rarr;</span>
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

      {/* Contact Section */}
      <div id="contact" className="relative isolate">
        <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-2">
          {/* Contact Info */}
          <div className="relative px-6 pt-24 pb-20 sm:pt-32 lg:static lg:px-8 lg:py-48">
            <div className="mx-auto max-w-xl lg:mx-0 lg:max-w-lg">
              <FadeIn>
                <h2 className="font-serif text-4xl font-semibold tracking-tight text-pretty text-text sm:text-5xl">
                  {t("Get in touch")}
                </h2>
                <p className="mt-6 text-lg/8 text-text-secondary">
                  {t(
                    "Questions about OghmaNotes? Feedback from users helps us improve. Reach out to the development team and we'll get back to you.",
                  )}
                </p>
              </FadeIn>
              <dl className="mt-10 space-y-4 text-base/7 text-text-secondary">
                <div className="flex gap-x-4">
                  <dt className="flex-none">
                    <span className="sr-only">{t("Address")}</span>
                    <BuildingOffice2Icon
                      aria-hidden="true"
                      className="h-7 w-6 text-text-tertiary"
                    />
                  </dt>
                  <dd>
                    {t("School of Computer Science")}
                    <br />
                    {t("University of Galway, Ireland")}
                  </dd>
                </div>
                <div className="flex gap-x-4">
                  <dt className="flex-none">
                    <span className="sr-only">{t("Telephone")}</span>
                    <PhoneIcon
                      aria-hidden="true"
                      className="h-7 w-6 text-text-tertiary"
                    />
                  </dt>
                  <dd>
                    <a
                      href="tel:+353-91-495556"
                      className="transition-colors hover:text-text"
                    >
                      +353 (91) 495-556
                    </a>
                  </dd>
                </div>
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
              </dl>
            </div>
          </div>

          {/* Contact Form */}
          <div className="px-6 pt-20 pb-24 sm:pb-32 lg:px-8 lg:py-48">
            <ContactForm />
          </div>
        </div>
      </div>

      {/* FAQ Section */}
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
