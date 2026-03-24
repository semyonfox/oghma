'use client'

import Link from 'next/link'
import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react'
import { MinusSmallIcon, PlusSmallIcon } from '@heroicons/react/24/outline'
import { BuildingOffice2Icon, EnvelopeIcon, PhoneIcon } from '@heroicons/react/24/outline'
import { motion } from 'motion/react'
import Header from '@/components/header'
import Footer from '@/components/footer'
import TestimonialSection from '@/components/testimonial-section'
import ContactForm from '@/components/contact-form'
import useI18n from '@/lib/notes/hooks/use-i18n'
import { useHomeFeatures } from '@/lib/hooks/useHomeFeatures'
import { useHomeFAQs } from '@/lib/hooks/useHomeFAQs'

function FadeIn({ children, delay = 0, className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// stylized CSS mock-up of the OghmaNote editor
function HeroMockup() {
  return (
    <div className="mt-16 sm:mt-24 rounded-2xl bg-surface ring-1 ring-white/10 shadow-2xl overflow-hidden">
      {/* title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-elevated/50 border-b border-white/5">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/60" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
          <div className="w-3 h-3 rounded-full bg-green-500/60" />
        </div>
        <span className="ml-2 text-xs text-text-tertiary">OghmaNotes</span>
      </div>
      {/* editor layout */}
      <div className="flex h-64 sm:h-80">
        {/* icon nav */}
        <div className="w-10 sm:w-12 bg-surface-elevated/30 border-r border-white/5 flex flex-col items-center gap-3 py-3">
          <div className="w-5 h-5 rounded bg-white/10" />
          <div className="w-5 h-5 rounded bg-white/10" />
          <div className="w-5 h-5 rounded bg-primary-500/30" />
          <div className="w-5 h-5 rounded bg-white/10" />
        </div>
        {/* file tree */}
        <div className="w-36 sm:w-48 border-r border-white/5 p-3 space-y-1.5 hidden sm:block">
          <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Files</div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-primary-500/40" />
            <div className="h-2 w-20 rounded bg-white/15" />
          </div>
          <div className="flex items-center gap-1.5 ml-3">
            <div className="w-3 h-3 rounded-sm bg-secondary-500/30" />
            <div className="h-2 w-16 rounded bg-white/10" />
          </div>
          <div className="flex items-center gap-1.5 ml-3">
            <div className="w-3 h-3 rounded-sm bg-secondary-500/30" />
            <div className="h-2 w-24 rounded bg-white/10" />
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            <div className="w-3 h-3 rounded-sm bg-primary-500/40" />
            <div className="h-2 w-14 rounded bg-white/15" />
          </div>
          <div className="flex items-center gap-1.5 ml-3">
            <div className="w-3 h-3 rounded-sm bg-secondary-500/30" />
            <div className="h-2 w-20 rounded bg-white/10" />
          </div>
        </div>
        {/* editor pane */}
        <div className="flex-1 p-4 sm:p-6 space-y-3">
          <div className="h-3 w-48 sm:w-64 rounded bg-white/15" />
          <div className="h-2 w-full rounded bg-white/[0.06]" />
          <div className="h-2 w-5/6 rounded bg-white/[0.06]" />
          <div className="h-2 w-4/6 rounded bg-white/[0.06]" />
          <div className="h-2 w-0" />
          <div className="h-2.5 w-32 rounded bg-white/10" />
          <div className="h-2 w-full rounded bg-white/[0.06]" />
          <div className="h-2 w-3/4 rounded bg-white/[0.06]" />
          <div className="h-2 w-5/6 rounded bg-white/[0.06]" />
        </div>
        {/* chat panel */}
        <div className="w-48 sm:w-56 border-l border-white/5 p-3 hidden md:flex flex-col">
          <div className="text-[10px] font-semibold text-ai-500/80 uppercase tracking-wider mb-3 flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-ai-500/30" />
            AI Chat
          </div>
          <div className="space-y-2 flex-1">
            <div className="rounded-lg bg-white/5 p-2 space-y-1">
              <div className="h-1.5 w-full rounded bg-white/10" />
              <div className="h-1.5 w-4/5 rounded bg-white/10" />
            </div>
            <div className="rounded-lg bg-ai-500/10 p-2 space-y-1 ml-2">
              <div className="h-1.5 w-full rounded bg-ai-500/20" />
              <div className="h-1.5 w-3/4 rounded bg-ai-500/20" />
              <div className="h-1.5 w-5/6 rounded bg-ai-500/20" />
            </div>
          </div>
          <div className="mt-auto pt-2 border-t border-white/5">
            <div className="h-7 rounded-md bg-white/5 border border-white/10" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const { t } = useI18n()
  const features = useHomeFeatures()
  const faqs = useHomeFAQs()

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
                'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
            }}
            className="relative left-[calc(50%-11rem)] aspect-1155/678 w-144.5 -translate-x-1/2 rotate-30 bg-linear-to-tr from-primary-500/30 to-secondary-500/20 opacity-20 sm:left-[calc(50%-30rem)] sm:w-288.75"
          />
        </div>
        <div className="py-24 sm:py-32 lg:pb-40">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <FadeIn>
                <h1 className="font-serif text-5xl font-semibold tracking-tight text-balance text-white sm:text-7xl">
                  {t('OghmaNotes: Semantic Notes & RAG Chat')}
                </h1>
              </FadeIn>
              <FadeIn delay={0.1}>
                <p className="mt-8 text-lg font-medium text-pretty text-gray-400 sm:text-xl/8">
                  {t('Upload PDFs. Ask questions with cited answers. Generate adaptive quizzes. Master your materials with spaced-repetition flashcards and Canvas sync. Offline-first learning, designed for busy students.')}
                </p>
              </FadeIn>
              <FadeIn delay={0.2}>
                <div className="mt-10 flex items-center justify-center gap-x-6">
                  <a
                    href="/register"
                    className="rounded-md bg-primary-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                  >
                    {t('Get started free')}
                  </a>
                  <a href="#features" className="text-sm/6 font-semibold text-white">
                    {t('Learn more')} <span aria-hidden="true">&rarr;</span>
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
                'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
            }}
            className="relative left-[calc(50%+3rem)] aspect-1155/678 w-144.5 -translate-x-1/2 bg-linear-to-tr from-primary-500/30 to-secondary-500/20 opacity-20 sm:left-[calc(50%+36rem)] sm:w-288.75"
          />
        </div>
      </div>

      {/* Features Section */}
      <div id="features" className="bg-background pb-24 sm:pb-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <FadeIn>
            <h2 className="text-center text-base/7 font-semibold text-primary-400">{t('Core Features')}</h2>
            <p className="mx-auto mt-2 max-w-lg text-center font-serif text-4xl font-semibold tracking-tight text-balance text-white sm:text-5xl">
              {t('Everything you need for RAG-powered learning')}
            </p>
          </FadeIn>
          <dl className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3">
            {features.map((feature, i) => (
              <FadeIn key={feature.name} delay={i * 0.05}>
                <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-6 transition-all duration-200 hover:bg-white/[0.07] hover:ring-white/20">
                  <dt>
                    <div className="bg-primary-500/10 rounded-lg p-2 w-fit mb-4">
                      <feature.icon aria-hidden="true" className="size-8 text-primary-400" />
                    </div>
                    <span className="font-serif text-lg font-semibold text-white">
                      {t(feature.name)}
                    </span>
                  </dt>
                  <dd className="mt-2 text-base/7 text-gray-400">{t(feature.description)}</dd>
                </div>
              </FadeIn>
            ))}
          </dl>
        </div>
      </div>

      {/* Testimonials Section */}
      <TestimonialSection />

      {/* CTA Section */}
      <div className="bg-background pb-16 sm:pb-24">
        <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
          <div className="relative isolate overflow-hidden bg-gray-800 px-6 py-24 after:pointer-events-none after:absolute after:inset-0 after:inset-ring after:inset-ring-white/15 sm:rounded-3xl sm:px-24 after:sm:rounded-3xl xl:py-32">
            <FadeIn>
              <h2 className="mx-auto max-w-3xl text-center font-serif text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                {t('Ready to master your materials?')}
              </h2>
              <p className="mx-auto mt-6 max-w-lg text-center text-lg text-gray-300">
                {t('Start with OghmaNotes today. Semantic search, RAG chat, adaptive quizzes, and spaced repetition—everything for RAG-powered learning.')}
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href="/register"
                  className="rounded-md bg-white px-6 py-3 text-sm font-semibold text-gray-900 shadow-xs hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {t('Get started free')}
                </a>
                <a href="/login" className="text-sm/6 font-semibold text-white">
                  {t('Sign in')} <span aria-hidden="true">&rarr;</span>
                </a>
              </div>
            </FadeIn>
            <svg
              viewBox="0 0 1024 1024"
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 -z-10 size-256 -translate-x-1/2"
            >
              <circle r={512} cx={512} cy={512} fill="url(#cta-gradient)" fillOpacity="0.7" />
              <defs>
                <radialGradient
                  r={1}
                  cx={0}
                  cy={0}
                  id="cta-gradient"
                  gradientUnits="userSpaceOnUse"
                  gradientTransform="translate(512 512) rotate(90) scale(512)"
                >
                  <stop stopColor="#3b82f6" />
                  <stop offset={1} stopColor="#14b8a6" stopOpacity={0} />
                </radialGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      {/* Contact Section */}
      <div id="contact" className="relative isolate bg-background">
        <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-2">
          {/* Contact Info */}
          <div className="relative px-6 pt-24 pb-20 sm:pt-32 lg:static lg:px-8 lg:py-48">
            <div className="mx-auto max-w-xl lg:mx-0 lg:max-w-lg">
              <FadeIn>
                <h2 className="font-serif text-4xl font-semibold tracking-tight text-pretty text-white sm:text-5xl">{t('Get in touch')}</h2>
                <p className="mt-6 text-lg/8 text-gray-400">
                  {t('Questions about OghmaNotes? Feedback from users helps us improve. Reach out to the development team and we\'ll get back to you.')}
                </p>
              </FadeIn>
              <dl className="mt-10 space-y-4 text-base/7 text-gray-300">
                <div className="flex gap-x-4">
                  <dt className="flex-none">
                    <span className="sr-only">{t('Address')}</span>
                    <BuildingOffice2Icon aria-hidden="true" className="h-7 w-6 text-gray-400" />
                  </dt>
                  <dd>
                    {t('School of Computer Science')}
                    <br />
                    {t('University of Galway, Ireland')}
                  </dd>
                </div>
                <div className="flex gap-x-4">
                  <dt className="flex-none">
                    <span className="sr-only">{t('Telephone')}</span>
                    <PhoneIcon aria-hidden="true" className="h-7 w-6 text-gray-400" />
                  </dt>
                  <dd>
                    <a href="tel:+353-91-495556" className="hover:text-white">
                      +353 (91) 495-556
                    </a>
                  </dd>
                </div>
                <div className="flex gap-x-4">
                  <dt className="flex-none">
                    <span className="sr-only">{t('Email')}</span>
                    <EnvelopeIcon aria-hidden="true" className="h-7 w-6 text-gray-400" />
                  </dt>
                  <dd>
                    <a href="mailto:contact@oghmanotes.ie" className="hover:text-white">
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
      <div className="bg-background">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8 lg:py-40">
          <div className="mx-auto max-w-4xl">
            <FadeIn>
              <h2 className="font-serif text-4xl font-semibold tracking-tight text-white sm:text-5xl">{t('Frequently asked questions')}</h2>
            </FadeIn>
            <dl className="mt-16 divide-y divide-white/10">
              {faqs.map((faq) => (
                <Disclosure key={faq.question} as="div" className="py-6 first:pt-0 last:pb-0">
                  <dt>
                    <DisclosureButton className="group flex w-full items-start justify-between text-left text-white">
                      <span className="text-base/7 font-semibold">{faq.question}</span>
                      <span className="ml-6 flex h-7 items-center">
                        <PlusSmallIcon aria-hidden="true" className="size-6 group-data-[open]:hidden" />
                        <MinusSmallIcon aria-hidden="true" className="size-6 group-not-data-[open]:hidden" />
                      </span>
                    </DisclosureButton>
                  </dt>
                  <DisclosurePanel as="dd" className="mt-2 pr-12">
                    <p className="text-base/7 text-gray-400">{faq.answer}</p>
                  </DisclosurePanel>
                </Disclosure>
              ))}
            </dl>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
