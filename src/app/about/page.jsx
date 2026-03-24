'use client'

import Link from 'next/link'
import Header from '@/components/header'
import { aboutBlogCards, authors } from '@/lib/blog-data'
import useI18n from '@/lib/notes/hooks/use-i18n'

const universities = [
  {
    name: 'Trinity College Dublin',
    logo: 'https://upload.wikimedia.org/wikipedia/en/d/d1/Trinity_College_Dublin.svg',
  },
  {
    name: 'University College Dublin',
    logo: 'https://upload.wikimedia.org/wikipedia/en/3/3b/University_College_Dublin_logo.svg',
  },
  {
    name: 'University College Cork',
    logo: 'https://upload.wikimedia.org/wikipedia/en/d/db/UCC_2.svg',
  },
  {
    name: 'NUI Galway',
    logo: '/University_Of_Galway_Logo__Positive_Landscape.svg',
  },
  {
    name: 'Dublin City University',
    logo: '/dcu_logo.png',
  },
]

const getStats = (t) => [
  { label: t('Notes organized daily'), value: '100K+' },
  { label: t('Learning time saved'), value: '500K hrs' },
  { label: t('Active learners'), value: '50K+' },
]
const getValues = (t) => [
  {
    name: t('Be world-class'),
    description: t('We strive for excellence in every feature we build, ensuring students get the best possible learning tools.'),
  },
  {
    name: t('Share everything you know'),
    description: t('Knowledge grows when shared. We build tools that make collaboration and knowledge-sharing effortless.'),
  },
  {
    name: t('Always learning'),
    description: t('We practice what we preach — constantly learning, iterating, and improving our platform based on feedback.'),
  },
  {
    name: t('Be supportive'),
    description: t('Every student learns differently. We design inclusive tools that support diverse learning styles and needs.'),
  },
  {
    name: t('Take responsibility'),
    description: t('We own our work end-to-end, from code quality to user experience, ensuring reliability you can count on.'),
  },
  {
    name: t('Enjoy downtime'),
    description: t('Balanced teams build better products. We value rest and creativity alongside focused development.'),
  },
]
const blogPosts = aboutBlogCards
const getTeam = (t) => [
  {
    name: authors.samuel.name,
    role: t('Full-Stack Developer'),
    description: t('Full-stack engineer building scalable web applications with modern technologies.'),
    imageUrl: authors.samuel.imageUrl,
    github: 'https://github.com/SamuelRegan-dev',
    linkedin: authors.samuel.linkedin,
  },
  {
    name: authors.semyon.name,
    role: t('Full-Stack Developer & Infrastructure'),
    description: t('Full-stack engineer leading technical strategy and infrastructure initiatives.'),
    imageUrl: authors.semyon.imageUrl,
    github: 'https://github.com/semyonfox',
    linkedin: authors.semyon.linkedin,
  },
  {
    name: authors.shreyansh.name,
    role: t('Full-Stack Developer'),
    description: t('Full-stack engineer contributing across frontend and backend features.'),
    imageUrl: authors.shreyansh.imageUrl,
    github: 'https://github.com/shreyanshSingh06',
    linkedin: authors.shreyansh.linkedin,
  },
]
const getFooterNavigation = (t) => ({
  main: [
    { name: t('About'), href: '/about' },
    { name: t('Blog'), href: '/blog' },
    { name: t('Jobs'), href: '#' },
    { name: t('Press'), href: '#' },
    { name: t('Accessibility'), href: '#' },
    { name: t('Partners'), href: '#' },
  ],
  social: [
    {
      name: t('Facebook'),
      href: '#',
      icon: (props) => (
        <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
          <path
            fillRule="evenodd"
            d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    {
      name: t('Instagram'),
      href: '#',
      icon: (props) => (
        <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
          <path
            fillRule="evenodd"
            d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
     {
       name: t('X'),
       href: '#',
      icon: (props) => (
        <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
          <path d="M13.6823 10.6218L20.2391 3H18.6854L12.9921 9.61788L8.44486 3H3.2002L10.0765 13.0074L3.2002 21H4.75404L10.7663 14.0113L15.5685 21H20.8131L13.6819 10.6218H13.6823ZM11.5541 13.0956L10.8574 12.0991L5.31391 4.16971H7.70053L12.1742 10.5689L12.8709 11.5655L18.6861 19.8835H16.2995L11.5541 13.096V13.0956Z" />
        </svg>
      ),
    },
     {
       name: t('GitHub'),
       href: '#',
      icon: (props) => (
        <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
          <path
            fillRule="evenodd"
            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
     {
       name: t('YouTube'),
       href: '#',
      icon: (props) => (
        <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
          <path
            fillRule="evenodd"
            d="M19.812 5.418c.861.23 1.538.907 1.768 1.768C21.998 8.746 22 12 22 12s0 3.255-.418 4.814a2.504 2.504 0 0 1-1.768 1.768c-1.56.419-7.814.419-7.814.419s-6.255 0-7.814-.419a2.505 2.505 0 0 1-1.768-1.768C2 15.255 2 12 2 12s0-3.255.417-4.814a2.507 2.507 0 0 1 1.768-1.768C5.744 5 11.998 5 11.998 5s6.255 0 7.814.418ZM15.194 12 10 15V9l5.194 3Z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
   ],
})

export default function About() {
  const { t } = useI18n()
  const stats = getStats(t)
  const values = getValues(t)
  const team = getTeam(t)
  const footerNavigation = getFooterNavigation(t)
  return (
    <div className="bg-background">
      <Header />

      <main className="isolate">
        {/* Hero section */}
        <div className="relative isolate -z-10">
          <svg
            aria-hidden="true"
            className="absolute inset-x-0 top-0 -z-10 h-256 w-full mask-[radial-gradient(32rem_32rem_at_center,white,transparent)] stroke-white/10"
          >
            <defs>
              <pattern
                x="50%"
                y={-1}
                id="1f932ae7-37de-4c0a-a8b0-a6e3b4d44b84"
                width={200}
                height={200}
                patternUnits="userSpaceOnUse"
              >
                <path d="M.5 200V.5H200" fill="none" />
              </pattern>
            </defs>
             <svg x="50%" y={-1} className="overflow-visible fill-surface">
              <path
                d="M-200 0h201v201h-201Z M600 0h201v201h-201Z M-400 600h201v201h-201Z M200 800h201v201h-201Z"
                strokeWidth={0}
              />
            </svg>
            <rect fill="url(#1f932ae7-37de-4c0a-a8b0-a6e3b4d44b84)" width="100%" height="100%" strokeWidth={0} />
          </svg>
          <div
            aria-hidden="true"
            className="absolute top-0 right-0 left-1/2 -z-10 -ml-24 transform-gpu overflow-hidden blur-3xl lg:ml-24 xl:ml-48"
          >
            <div
              style={{
                clipPath:
                  'polygon(63.1% 29.5%, 100% 17.1%, 76.6% 3%, 48.4% 0%, 44.6% 4.7%, 54.5% 25.3%, 59.8% 49%, 55.2% 57.8%, 44.4% 57.2%, 27.8% 47.9%, 35.1% 81.5%, 0% 97.7%, 39.2% 100%, 35.2% 81.4%, 97.2% 52.8%, 63.1% 29.5%)',
              }}
              className="aspect-801/1036 w-200.25 bg-linear-to-tr from-[#ff80b5] to-[#9089fc] opacity-30"
            />
          </div>
          <div className="overflow-hidden">
            <div className="mx-auto max-w-7xl px-6 pt-36 pb-32 sm:pt-60 lg:px-8 lg:pt-32">
              <div className="mx-auto max-w-2xl gap-x-14 lg:mx-0 lg:flex lg:max-w-none lg:items-center">
                <div className="relative w-full lg:max-w-xl lg:shrink-0 xl:max-w-2xl">
                  <h1 className="text-5xl font-semibold tracking-tight text-pretty text-white sm:text-7xl">
                    {t("We're changing the way people learn")}
                  </h1>
                   <p className="mt-8 text-lg font-medium text-pretty text-text-tertiary sm:max-w-md sm:text-xl/8 lg:max-w-none">
                    {t("OghmaNotes empowers students and professionals to take better notes, stay organized, and learn more effectively. Our AI-powered platform transforms how you capture and manage knowledge.")}
                  </p>
                </div>
                <div className="mt-14 flex justify-end gap-8 sm:-mt-44 sm:justify-start sm:pl-20 lg:mt-0 lg:pl-0">
                  <div className="ml-auto w-44 flex-none space-y-8 pt-32 sm:ml-0 sm:pt-80 lg:order-last lg:pt-36 xl:order-0 xl:pt-80">
                    <div className="relative">
                      <img
                        alt=""
                        src="https://images.unsplash.com/photo-1557804506-669a67965ba0?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&h=528&q=80"
                        className="aspect-2/3 w-full rounded-xl bg-gray-700/5 object-cover shadow-lg"
                      />
                      <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/10 ring-inset" />
                    </div>
                  </div>
                  <div className="mr-auto w-44 flex-none space-y-8 sm:mr-0 sm:pt-52 lg:pt-36">
                    <div className="relative">
                      <img
                        alt=""
                        src="https://images.unsplash.com/photo-1485217988980-11786ced9454?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&h=528&q=80"
                        className="aspect-2/3 w-full rounded-xl bg-gray-700/5 object-cover shadow-lg"
                      />
                      <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/10 ring-inset" />
                    </div>
                    <div className="relative">
                      <img
                        alt=""
                        src="https://images.unsplash.com/photo-1559136555-9303baea8ebd?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&crop=focalpoint&fp-x=.4&w=396&h=528&q=80"
                        className="aspect-2/3 w-full rounded-xl bg-gray-700/5 object-cover shadow-lg"
                      />
                      <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/10 ring-inset" />
                    </div>
                  </div>
                  <div className="w-44 flex-none space-y-8 pt-32 sm:pt-0">
                    <div className="relative">
                      <img
                        alt=""
                        src="https://images.unsplash.com/photo-1670272504528-790c24957dda?ixlib=rb-4.0.3&ixid=MnwxMjA3fDF8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&crop=left&w=400&h=528&q=80"
                        className="aspect-2/3 w-full rounded-xl bg-gray-700/5 object-cover shadow-lg"
                      />
                      <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/10 ring-inset" />
                    </div>
                    <div className="relative">
                      <img
                        alt=""
                        src="https://images.unsplash.com/photo-1670272505284-8faba1c31f7d?ixlib=rb-4.0.3&ixid=MnwxMjA3fDF8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&h=528&q=80"
                        className="aspect-2/3 w-full rounded-xl bg-gray-700/5 object-cover shadow-lg"
                      />
                      <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/10 ring-inset" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content section */}
        <div className="mx-auto -mt-12 max-w-7xl px-6 sm:mt-0 lg:px-8 xl:-mt-8">
          <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none">
            <h2 className="text-4xl font-semibold tracking-tight text-pretty text-white sm:text-5xl">{t("Our mission")}</h2>
            <div className="mt-6 flex flex-col gap-x-8 gap-y-20 lg:flex-row">
              <div className="lg:w-full lg:max-w-2xl lg:flex-auto">
                 <p className="text-xl/8 text-text-secondary">
                  {t("At OghmaNotes, we believe that better note-taking leads to better learning. That's why we've built a platform designed to help you capture, organize, and understand information more effectively.")}
                </p>
                 <p className="mt-10 max-w-xl text-base/7 text-text-tertiary">
                  {t("Whether you're in the classroom, attending lectures, or conducting research, OghmaNotes is designed to help you learn smarter, faster, and with greater retention.")}
                </p>
              </div>
              <div className="lg:flex lg:flex-auto lg:justify-center">
                <dl className="w-64 space-y-8 xl:w-80">
                  {stats.map((stat) => (
                    <div key={stat.label} className="flex flex-col-reverse gap-y-4">
                       <dt className="text-base/7 text-text-tertiary">{stat.label}</dt>
                      <dd className="text-5xl font-semibold tracking-tight text-white">{stat.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Image section */}
        <div className="mt-32 sm:mt-40 xl:mx-auto xl:max-w-7xl xl:px-8">
          <img
            alt=""
            src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2832&q=80"
            className="aspect-5/2 w-full object-cover outline-1 -outline-offset-1 outline-white/10 xl:rounded-3xl"
          />
        </div>

        {/* Features section */}
        <div className="mx-auto mt-32 max-w-7xl px-6 sm:mt-40 lg:px-8">
          <div className="mx-auto max-w-2xl lg:mx-0">
            <h2 className="text-4xl font-semibold tracking-tight text-pretty text-white sm:text-5xl">{t("Powerful features")}</h2>
             <p className="mt-6 text-lg/8 text-text-secondary">
               {t("Everything you need to take better notes and learn more effectively.")}
             </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 sm:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-2 xl:grid-cols-4">
            {/* Feature 1 - AI-Powered Insights */}
            <div className="group relative overflow-hidden rounded-2xl border border-indigo-500/20 p-8 transition-all hover:border-indigo-500/60 hover:shadow-lg hover:shadow-indigo-500/20">
              <div className="absolute inset-0 -z-10 bg-gradient-to-br from-indigo-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="mb-6 inline-flex rounded-lg bg-indigo-500/10 p-3">
                <span className="text-3xl">✨</span>
              </div>
              <h3 className="text-lg font-semibold text-white">{t('AI-Powered Insights')}</h3>
               <p className="mt-3 text-sm text-text-tertiary leading-relaxed">
                 {t('Get intelligent summaries, key takeaways, and smart suggestions as you take notes.')}
               </p>
            </div>

            {/* Feature 2 - Canvas Sync */}
            <div className="group relative overflow-hidden rounded-2xl border border-blue-500/20 p-8 transition-all hover:border-blue-500/60 hover:shadow-lg hover:shadow-blue-500/20">
              <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="mb-6 inline-flex rounded-lg bg-blue-500/10 p-3">
                <span className="text-3xl">🔗</span>
              </div>
              <h3 className="text-lg font-semibold text-white">{t('Seamless Canvas Integration')}</h3>
               <p className="mt-3 text-sm text-text-tertiary leading-relaxed">
                 {t('Auto-sync assignments, deadlines, and course materials directly from Canvas.')}
               </p>
            </div>

            {/* Feature 3 - Smart Organization */}
            <div className="group relative overflow-hidden rounded-2xl border border-purple-500/20 p-8 transition-all hover:border-purple-500/60 hover:shadow-lg hover:shadow-purple-500/20">
              <div className="absolute inset-0 -z-10 bg-gradient-to-br from-purple-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="mb-6 inline-flex rounded-lg bg-purple-500/10 p-3">
                <span className="text-3xl">📚</span>
              </div>
              <h3 className="text-lg font-semibold text-white">{t('Smart Organization')}</h3>
               <p className="mt-3 text-sm text-text-tertiary leading-relaxed">
                 {t('Auto-categorize notes, tag content intelligently, and find anything in seconds.')}
               </p>
            </div>

            {/* Feature 4 - Work Anywhere */}
            <div className="group relative overflow-hidden rounded-2xl border border-pink-500/20 p-8 transition-all hover:border-pink-500/60 hover:shadow-lg hover:shadow-pink-500/20">
              <div className="absolute inset-0 -z-10 bg-gradient-to-br from-pink-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="mb-6 inline-flex rounded-lg bg-pink-500/10 p-3">
                <span className="text-3xl">📱</span>
              </div>
              <h3 className="text-lg font-semibold text-white">{t('Work Anywhere')}</h3>
               <p className="mt-3 text-sm text-text-tertiary leading-relaxed">
                 {t('Access your notes on desktop, tablet, or phone with full offline support.')}
               </p>
            </div>
          </div>
        </div>

        {/* Logo cloud */}
        <div className="relative isolate -z-10 mt-32 sm:mt-48">
          <div className="absolute inset-x-0 top-1/2 -z-10 flex -translate-y-1/2 justify-center overflow-hidden mask-[radial-gradient(50%_45%_at_50%_55%,white,transparent)]">
            <svg aria-hidden="true" className="h-160 w-7xl flex-none stroke-white/10">
              <defs>
                <pattern
                  x="50%"
                  y="50%"
                  id="e9033f3e-f665-41a6-84ef-756f6778e6fe"
                  width={200}
                  height={200}
                  patternUnits="userSpaceOnUse"
                  patternTransform="translate(-100 0)"
                >
                  <path d="M.5 200V.5H200" fill="none" />
                </pattern>
              </defs>
              <svg x="50%" y="50%" className="overflow-visible fill-surface">
                <path d="M-300 0h201v201h-201Z M300 200h201v201h-201Z" strokeWidth={0} />
              </svg>
              <rect fill="url(#e9033f3e-f665-41a6-84ef-756f6778e6fe)" width="100%" height="100%" strokeWidth={0} />
            </svg>
          </div>
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
             <h2 className="text-center text-lg/8 font-semibold text-white">
               {t("Trusted by students and educators worldwide")}
             </h2>
            <div className="mx-auto mt-10 grid max-w-4xl grid-cols-2 items-center gap-x-8 gap-y-10 sm:max-w-2xl sm:grid-cols-3 sm:gap-x-10 lg:mx-0 lg:max-w-none lg:grid-cols-5 lg:gap-x-12 lg:gap-y-16">
              {universities.map((uni) => (
                <div
                  key={uni.name}
                  className={uni.name === 'NUI Galway' ? 'col-span-1 rounded-lg bg-white/10 p-4 flex items-center justify-center' : 'col-span-1'}
                >
                  <img
                    alt={uni.name}
                    src={uni.logo}
                    className="max-h-32 w-full object-contain"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Team section */}
         <div className="bg-background py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-6 text-center lg:px-8">
            <div className="mx-auto max-w-2xl">
              <h2 className="text-4xl font-semibold tracking-tight text-balance text-white sm:text-5xl">{t("Meet our team")}</h2>
               <p className="mt-6 text-lg/8 text-text-tertiary">
                 {t("We're a dynamic group of individuals who are passionate about what we do and dedicated to creating the best learning platform.")}
               </p>
            </div>
            <ul
              role="list"
              className="mx-auto mt-20 grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3 lg:gap-8"
            >
              {team.map((person) => (
                <li key={person.name} className="rounded-2xl bg-surface px-8 py-10">
                  <a href={person.linkedin} className="inline-block" target="_blank" rel="noopener noreferrer">
                    <img
                      alt={person.name}
                      src={person.imageUrl}
                      className="mx-auto size-48 rounded-full outline-1 -outline-offset-1 outline-white/10 md:size-56"
                    />
                  </a>
                  <h3 className="mt-6 text-base/7 font-semibold tracking-tight text-white">
                     <a href={person.linkedin} className="hover:text-text-secondary" target="_blank" rel="noopener noreferrer">
                      {person.name}
                    </a>
                  </h3>
                   <p className="text-sm/6 text-text-tertiary">{person.role}</p>
                   <p className="mt-2 text-sm/6 text-text-secondary">{person.description}</p>
                  <ul role="list" className="mt-6 flex justify-center gap-x-6">
                    <li>
                       <a href={person.github} className="text-text-tertiary hover:text-text-secondary" target="_blank" rel="noopener noreferrer">
                        <span className="sr-only">GitHub</span>
                        <svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true" className="size-5">
                          <path
                            fillRule="evenodd"
                            d="M10 1.667c-4.597 0-8.333 3.736-8.333 8.333 0 3.682 2.386 6.813 5.698 7.916.417.083.583-.208.583-.417v-1.458c-2.292.5-2.917-1.208-2.917-1.208-.375-.958-1.042-1.208-1.042-1.208-.833-.583.083-.583.083-.583.917.083 1.458.958 1.458.958.833 1.458 2.25 1.042 2.791.833.083-.667.333-1.042.583-1.292-2.083-.25-4.292-1.042-4.292-4.583 0-1.042.375-1.875.958-2.542-.083-.25-.375-1.208.083-2.5 0 0 .792-.25 2.583.958.75-.208 1.542-.333 2.333-.333.792 0 1.583.125 2.333.333 1.792-1.208 2.583-.958 2.583-.958.458 1.292.167 2.25.083 2.5.583.667.958 1.5.958 2.542 0 3.542-2.208 4.333-4.292 4.583.333.292.625.875.625 1.792v2.667c0 .208.167.5.583.417 3.312-1.104 5.698-4.235 5.698-7.916 0-4.598-3.736-8.333-8.333-8.333z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </a>
                    </li>
                    <li>
                       <a href={person.linkedin} className="text-text-tertiary hover:text-text-secondary" target="_blank" rel="noopener noreferrer">
                        <span className="sr-only">LinkedIn</span>
                        <svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true" className="size-5">
                          <path
                            d="M16.338 16.338H13.67V12.16c0-.995-.017-2.277-1.387-2.277-1.39 0-1.601 1.086-1.601 2.207v4.248H8.014v-8.59h2.559v1.174h.037c.356-.675 1.227-1.387 2.526-1.387 2.703 0 3.203 1.778 3.203 4.092v4.711zM5.005 6.575a1.548 1.548 0 11-.003-3.096 1.548 1.548 0 01.003 3.096zm-1.337 9.763H6.34v-8.59H3.667v8.59zM17.668 1H2.328C1.595 1 1 1.581 1 2.298v15.403C1 18.418 1.595 19 2.328 19h15.34c.734 0 1.332-.582 1.332-1.299V2.298C19 1.581 18.402 1 17.668 1z"
                            clipRule="evenodd"
                            fillRule="evenodd"
                          />
                        </svg>
                      </a>
                    </li>
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Blog section */}
        <div id="blog" className="mx-auto mt-32 max-w-7xl px-6 sm:mt-40 lg:px-8">
          <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none">
            <h2 className="text-4xl font-semibold tracking-tight text-balance text-white sm:text-5xl">{t("From our blog")}</h2>
             <p className="mt-2 text-lg/8 text-text-tertiary">{t("Learn from our experts and community on note-taking, learning, and productivity.")}</p>
          </div>
          <div className="mx-auto mt-16 grid max-w-2xl auto-rows-fr grid-cols-1 gap-8 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
            {blogPosts.map((post) => (
              <article
                key={post.slug}
                className="relative isolate flex flex-col justify-end overflow-hidden rounded-2xl bg-surface px-8 pt-80 pb-8 sm:pt-48 lg:pt-80"
              >
                <img alt="" src={post.imageUrl} className="absolute inset-0 -z-10 size-full object-cover" />
                <div className="absolute inset-0 -z-10 bg-linear-to-t from-black/80 via-black/40" />
                <div className="absolute inset-0 -z-10 rounded-2xl inset-ring inset-ring-white/10" />

                 <div className="flex flex-wrap items-center gap-y-1 overflow-hidden text-sm/6 text-text-secondary">
                  <time dateTime={post.datetime} className="mr-8">
                    {post.date}
                  </time>
                  <div className="-ml-4 flex items-center gap-x-4">
                    <svg viewBox="0 0 2 2" className="-ml-0.5 size-0.5 flex-none fill-gray-300/50">
                      <circle r={1} cx={1} cy={1} />
                    </svg>
                    <a
                      href={post.author.linkedin}
                       className="flex items-center gap-x-2.5 text-text-secondary hover:text-white"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img alt={post.author.name} src={post.author.imageUrl} className="size-6 flex-none rounded-full bg-gray-800/10" />
                      <span>{post.author.name}</span>
                    </a>
                  </div>
                </div>
                <h3 className="mt-3 text-lg/6 font-semibold text-white">
                  <Link href={`/blog/${post.slug}`}>
                    <span className="absolute inset-0" />
                    {post.title}
                  </Link>
                </h3>
              </article>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 sm:mt-32">
        <div className="mx-auto max-w-7xl overflow-hidden px-6 py-20 sm:py-24 lg:px-8">
          <nav aria-label="Footer" className="-mb-6 flex flex-wrap justify-center gap-x-12 gap-y-3 text-sm/6">
            {footerNavigation.main.map((item) => (
              <a key={item.name} href={item.href} className="text-text-tertiary hover:text-white">
                {item.name}
              </a>
            ))}
          </nav>
          <div className="mt-16 flex justify-center gap-x-10">
            {footerNavigation.social.map((item) => (
              <a key={item.name} href={item.href} className="text-text-tertiary hover:text-white">
                <span className="sr-only">{item.name}</span>
                <item.icon aria-hidden="true" className="size-6" />
              </a>
            ))}
          </div>
           <p className="mt-10 text-center text-sm/6 text-text-tertiary">
            {t("All rights reserved.")}
          </p>
        </div>
      </footer>
    </div>
  )
}
