'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogPanel, Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react'
import { Bars3Icon, XMarkIcon, MinusSmallIcon, PlusSmallIcon } from '@heroicons/react/24/outline'
import { BuildingOffice2Icon, EnvelopeIcon, PhoneIcon } from '@heroicons/react/24/outline'
import Footer from '@/components/footer'
import {
  ArrowPathIcon,
  CloudArrowUpIcon,
  Cog6ToothIcon,
  FingerPrintIcon,
  LockClosedIcon,
  ServerIcon,
} from '@heroicons/react/20/solid'

const navigation = [
  { name: 'Features', href: '/#features' },
  { name: 'About', href: '/about' },
  { name: 'Blog', href: '/about#blog' },
  { name: 'Contact', href: '/about#contact' },
]

const features = [
  {
    name: 'Rich Markdown Editor',
    description: 'Write beautiful, formatted notes with live preview, syntax highlighting, and seamless organization.',
    icon: Cog6ToothIcon,
  },
  {
    name: 'AI-Powered Insights',
    description: 'Get intelligent summaries, key concepts, and study questions generated automatically from your notes.',
    icon: CloudArrowUpIcon,
  },
  {
    name: 'Canvas Integration',
    description: 'Seamlessly sync notes from your Canvas courses and keep all study materials in one place.',
    icon: ArrowPathIcon,
  },
  {
    name: 'Secure Cloud Storage',
    description: 'Your notes are safely stored and accessible from any device with enterprise-grade encryption.',
    icon: LockClosedIcon,
  },
  {
    name: 'Collaborative Learning',
    description: 'Share notes with classmates, collaborate on study materials, and learn together in real-time.',
    icon: FingerPrintIcon,
  },
  {
    name: 'Multi-User Support',
    description: 'Built for university teams with secure authentication, role-based access, and session management.',
    icon: ServerIcon,
  },
]



const faqs = [
  {
    question: 'What is AI Study Vault?',
    answer:
      'AI Study Vault is a RAG-powered learning platform that combines Markdown notes with semantic search and AI. Upload PDFs from lectures, ask questions about your materials with cited answers, and get adaptive quizzes and flashcards personalized to your learning pace.',
  },
  {
    question: 'How does the RAG chat work?',
    answer:
      'Upload any PDF or document. The system extracts text, chunks it semantically, and stores embeddings in our vector database. When you ask a question, it retrieves relevant material and generates answers with direct citations so you know where information came from.',
  },
  {
    question: 'Can I integrate Canvas deadlines?',
    answer:
      'Yes. Connect your Canvas account and AI Study Vault automatically syncs your courses, assignments, and deadlines daily. All your course materials are organized in one place with integrated calendar views.',
  },
  {
    question: 'What are spaced repetition flashcards?',
    answer:
      'We use the SM-2 algorithm to schedule flashcard reviews at optimal intervals. The system learns which cards you struggle with and prioritizes them, scientifically proven to improve long-term retention.',
  },
  {
    question: 'Do you generate quizzes automatically?',
    answer:
      'Absolutely. AI Study Vault generates adaptive quizzes from your notes and materials. Questions scale in difficulty based on your performance, giving you targeted practice on weak areas.',
  },
  {
    question: 'Can I access my notes offline?',
    answer:
      'Yes! AI Study Vault is a Progressive Web App. Write and edit notes offline, and they sync automatically when you reconnect. Perfect for lecture halls and studying anywhere.',
  },
]

const STUDENT_TESTIMONIALS = [
  {
    quote: "AI Study Vault helped me organize my Canvas lectures and AI summaries cut my study time in half. I went from struggling to acing my exams.",
    author: "Sarah Chen",
    role: "Computer Science Student"
  },
  {
    quote: "The Canvas integration is a game-changer. My notes are automatically synced, and the AI insights help me actually understand the material.",
    author: "Marcus Johnson",
    role: "Engineering Student"
  },
  {
    quote: "Finally, a note-taking app built for students. The markdown editor is smooth, and the AI study questions keep me accountable.",
    author: "Emma Rodriguez",
    role: "Biology Student"
  },
  {
    quote: "I love how minimal and focused AI Study Vault is. No distractions, just powerful tools for learning. Highly recommend to any student.",
    author: "David Kim",
    role: "Economics Student"
  },
  {
    quote: "The AI-powered insights are incredible. It summarizes lectures in seconds and generates study guides automatically. Worth every penny.",
    author: "Jessica Walsh",
    role: "Medical Student"
  }
];

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [testimonial, setTestimonial] = useState(STUDENT_TESTIMONIALS[0])

  // Set random testimonial after hydration to avoid hydration mismatch
  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * STUDENT_TESTIMONIALS.length)
    setTestimonial(STUDENT_TESTIMONIALS[randomIndex])
  }, [])

  return (
    <div className="bg-gray-900">
      <header className="absolute inset-x-0 top-0 z-50">
        <nav aria-label="Global" className="flex items-center justify-between p-6 lg:px-8">
          <div className="flex lg:flex-1">
            <a href="#" className="-m-1.5 p-1.5">
              <span className="sr-only">AI Study Vault</span>
              <img
                alt=""
                src="https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=indigo&shade=500"
                className="h-8 w-auto"
              />
            </a>
          </div>
          <div className="flex lg:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-400"
            >
              <span className="sr-only">Open main menu</span>
              <Bars3Icon aria-hidden="true" className="size-6" />
            </button>
          </div>
          <div className="hidden lg:flex lg:gap-x-12">
            {navigation.map((item) => (
              <a key={item.name} href={item.href} className="text-sm/6 font-semibold text-white">
                {item.name}
              </a>
            ))}
          </div>
          <div className="hidden lg:flex lg:flex-1 lg:justify-end">
            <a href="/login" className="text-sm/6 font-semibold text-white">
              Log in <span aria-hidden="true">&rarr;</span>
            </a>
          </div>
        </nav>
        <Dialog open={mobileMenuOpen} onClose={setMobileMenuOpen} className="lg:hidden">
          <div className="fixed inset-0 z-50" />
          <DialogPanel className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-gray-900 p-6 sm:max-w-sm sm:ring-1 sm:ring-gray-100/10">
            <div className="flex items-center justify-between">
              <a href="#" className="-m-1.5 p-1.5">
                <span className="sr-only">AI Study Vault</span>
                <img
                  alt=""
                  src="https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=indigo&shade=500"
                  className="h-8 w-auto"
                />
              </a>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="-m-2.5 rounded-md p-2.5 text-gray-400"
              >
                <span className="sr-only">Close menu</span>
                <XMarkIcon aria-hidden="true" className="size-6" />
              </button>
            </div>
            <div className="mt-6 flow-root">
              <div className="-my-6 divide-y divide-gray-500/25">
                <div className="space-y-2 py-6">
                  {navigation.map((item) => (
                    <a
                      key={item.name}
                      href={item.href}
                      className="-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold text-white hover:bg-white/5"
                    >
                      {item.name}
                    </a>
                  ))}
                </div>
                <div className="py-6">
                  <a
                    href="/login"
                    className="-mx-3 block rounded-lg px-3 py-2.5 text-base/7 font-semibold text-white hover:bg-white/5"
                  >
                    Log in
                  </a>
                </div>
              </div>
            </div>
          </DialogPanel>
        </Dialog>
      </header>

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
            className="relative left-[calc(50%-11rem)] aspect-1155/678 w-144.5 -translate-x-1/2 rotate-30 bg-linear-to-tr from-[#ff80b5] to-[#9089fc] opacity-20 sm:left-[calc(50%-30rem)] sm:w-288.75"
          />
        </div>
        <div className="py-24 sm:py-32 lg:pb-40">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="text-5xl font-semibold tracking-tight text-balance text-white sm:text-7xl">
                AI Study Vault: Semantic Notes & RAG Chat
              </h1>
              <p className="mt-8 text-lg font-medium text-pretty text-gray-400 sm:text-xl/8">
                Upload PDFs. Ask questions with cited answers. Generate adaptive quizzes. Master your materials with spaced-repetition flashcards and Canvas sync. Offline-first learning, designed for busy students.
              </p>
              <div className="mt-10 flex items-center justify-center gap-x-6">
                <a
                  href="/register"
                  className="rounded-md bg-indigo-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                >
                  Get started free
                </a>
                <a href="#features" className="text-sm/6 font-semibold text-white">
                  Learn more <span aria-hidden="true">→</span>
                </a>
              </div>
            </div>

            <div className="relative overflow-hidden">
              <img
                alt="AI Study Vault dashboard"
                src="https://tailwindcss.com/plus-assets/img/component-images/dark-project-app-screenshot.png"
                width={2432}
                height={1442}
                className="mt-16 mb-[-12%] rounded-md bg-white/5 shadow-2xl ring-1 ring-white/10 sm:mt-24"
              />
              <div aria-hidden="true" className="relative">
                <div className="absolute -inset-x-20 bottom-0 bg-linear-to-t from-gray-900 pt-[7%]" />
              </div>
            </div>
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
            className="relative left-[calc(50%+3rem)] aspect-1155/678 w-144.5 -translate-x-1/2 bg-linear-to-tr from-[#ff80b5] to-[#9089fc] opacity-20 sm:left-[calc(50%+36rem)] sm:w-288.75"
          />
        </div>
      </div>

      {/* Features Section */}
      <div id="features" className="bg-gray-900 pb-24 sm:pb-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <h2 className="text-center text-base/7 font-semibold text-indigo-400">Core Features</h2>
          <p className="mx-auto mt-2 max-w-lg text-center text-4xl font-semibold tracking-tight text-balance text-white sm:text-5xl">
            Everything you need for RAG-powered learning
          </p>
          <dl className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-x-6 gap-y-10 text-base/7 text-gray-400 sm:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3 lg:gap-x-8 lg:gap-y-16">
            {features.map((feature) => (
              <div key={feature.name} className="relative pl-9">
                <dt className="inline font-semibold text-white">
                  <feature.icon aria-hidden="true" className="absolute top-1 left-1 size-5 text-indigo-400" />
                  {feature.name}
                </dt>{' '}
                <dd className="inline">{feature.description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Testimonials Section */}
      <div className="bg-gray-800/50 py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-6 lg:px-8">
          <h2 className="text-3xl font-semibold tracking-tight text-white text-center mb-12">What students say</h2>
          
          {/* Single Rotating Testimonial */}
          <div className="p-8 rounded-lg border border-white/10 bg-gray-900/50 backdrop-blur">
            <div className="flex gap-1 mb-4">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="text-yellow-400">★</span>
              ))}
            </div>
            <p className="text-lg text-gray-100 mb-6 italic">"{testimonial.quote}"</p>
            <div>
              <p className="font-semibold text-white">{testimonial.author}</p>
              <p className="text-sm text-gray-400">{testimonial.role}</p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-gray-900 pb-16 sm:pb-24">
        <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
          <div className="relative isolate overflow-hidden bg-gray-800 px-6 py-24 after:pointer-events-none after:absolute after:inset-0 after:inset-ring after:inset-ring-white/15 sm:rounded-3xl sm:px-24 after:sm:rounded-3xl xl:py-32">
            <h2 className="mx-auto max-w-3xl text-center text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Ready to master your materials?
            </h2>
            <p className="mx-auto mt-6 max-w-lg text-center text-lg text-gray-300">
              Start with AI Study Vault today. Semantic search, RAG chat, adaptive quizzes, and spaced repetition—everything for RAG-powered learning.
            </p>
            <form className="mx-auto mt-10 flex max-w-md gap-x-4">
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                required
                placeholder="Enter your email"
                autoComplete="email"
                className="min-w-0 flex-auto rounded-md bg-white/5 px-3.5 py-2 text-base text-white outline-1 -outline-offset-1 outline-white/20 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
              />
              <button
                type="submit"
                className="flex-none rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Get Started
              </button>
            </form>
            <svg
              viewBox="0 0 1024 1024"
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 -z-10 size-256 -translate-x-1/2"
            >
              <circle r={512} cx={512} cy={512} fill="url(#759c1415-0410-454c-8f7c-9a820de03641)" fillOpacity="0.7" />
              <defs>
                <radialGradient
                  r={1}
                  cx={0}
                  cy={0}
                  id="759c1415-0410-454c-8f7c-9a820de03641"
                  gradientUnits="userSpaceOnUse"
                  gradientTransform="translate(512 512) rotate(90) scale(512)"
                >
                  <stop stopColor="#7775D6" />
                  <stop offset={1} stopColor="#E935C1" stopOpacity={0} />
                </radialGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      {/* Contact Section */}
      <div id="contact" className="relative isolate bg-gray-900">
        <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-2">
          {/* Contact Info */}
          <div className="relative px-6 pt-24 pb-20 sm:pt-32 lg:static lg:px-8 lg:py-48">
            <div className="mx-auto max-w-xl lg:mx-0 lg:max-w-lg">
              <h2 className="text-4xl font-semibold tracking-tight text-pretty text-white sm:text-5xl">Get in touch</h2>
              <p className="mt-6 text-lg/8 text-gray-400">
                Questions about AI Study Vault? Feedback from users helps us improve. Reach out to the development team and we'll get back to you.
              </p>
              <dl className="mt-10 space-y-4 text-base/7 text-gray-300">
                <div className="flex gap-x-4">
                  <dt className="flex-none">
                    <span className="sr-only">Address</span>
                    <BuildingOffice2Icon aria-hidden="true" className="h-7 w-6 text-gray-400" />
                  </dt>
                  <dd>
                    School of Computer Science
                    <br />
                    University of Galway, Ireland
                  </dd>
                </div>
                <div className="flex gap-x-4">
                  <dt className="flex-none">
                    <span className="sr-only">Telephone</span>
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
                    <span className="sr-only">Email</span>
                    <EnvelopeIcon aria-hidden="true" className="h-7 w-6 text-gray-400" />
                  </dt>
                  <dd>
                    <a href="mailto:feedback@aistudyvault.dev" className="hover:text-white">
                      feedback@aistudyvault.dev
                    </a>
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Contact Form */}
          <form action="/api/contact" method="POST" className="px-6 pt-20 pb-24 sm:pb-32 lg:px-8 lg:py-48">
            <div className="mx-auto max-w-xl lg:mr-0 lg:max-w-lg">
              <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="first-name" className="block text-sm/6 font-semibold text-white">
                    First name
                  </label>
                  <div className="mt-2.5">
                    <input
                      id="first-name"
                      name="firstName"
                      type="text"
                      autoComplete="given-name"
                      required
                      className="block w-full rounded-md bg-white/5 px-3.5 py-2 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="last-name" className="block text-sm/6 font-semibold text-white">
                    Last name
                  </label>
                  <div className="mt-2.5">
                    <input
                      id="last-name"
                      name="lastName"
                      type="text"
                      autoComplete="family-name"
                      required
                      className="block w-full rounded-md bg-white/5 px-3.5 py-2 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="email" className="block text-sm/6 font-semibold text-white">
                    Email
                  </label>
                  <div className="mt-2.5">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className="block w-full rounded-md bg-white/5 px-3.5 py-2 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="phone-number" className="block text-sm/6 font-semibold text-white">
                    Phone number
                  </label>
                  <div className="mt-2.5">
                    <input
                      id="phone-number"
                      name="phoneNumber"
                      type="tel"
                      autoComplete="tel"
                      className="block w-full rounded-md bg-white/5 px-3.5 py-2 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="message" className="block text-sm/6 font-semibold text-white">
                    Message
                  </label>
                  <div className="mt-2.5">
                    <textarea
                      id="message"
                      name="message"
                      rows={4}
                      required
                      className="block w-full rounded-md bg-white/5 px-3.5 py-2 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500"
                    />
                  </div>
                </div>
              </div>
              <div className="mt-8 flex justify-end">
                <button
                  type="submit"
                  className="rounded-md bg-indigo-500 px-3.5 py-2.5 text-center text-sm font-semibold text-white shadow-xs hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                >
                  Send message
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="bg-gray-900">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8 lg:py-40">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Frequently asked questions</h2>
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
