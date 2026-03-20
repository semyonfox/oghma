'use client'

import { useMemo } from 'react'
import useI18n from '@/lib/notes/hooks/use-i18n'

export default function TestimonialSection() {
  const { t } = useI18n()
  
  const STUDENT_TESTIMONIALS = useMemo(() => [
    {
      quote: t("The Canvas integration is a game-changer. My notes are automatically synced, and the AI insights help me actually understand the material."),
      author: t("Marcus Johnson"),
      role: t("Engineering Student")
    },
    {
      quote: t("Finally, a note-taking app built for students. The markdown editor is smooth, and the AI study questions keep me accountable."),
      author: t("Emma Rodriguez"),
      role: t("Biology Student")
    },
    {
      quote: t("I love how minimal and focused OghmaNotes is. No distractions, just powerful tools for learning. Highly recommend to any student."),
      author: t("David Kim"),
      role: t("Economics Student")
    },
    {
      quote: t("The AI-powered insights are incredible. It summarizes lectures in seconds and generates study guides automatically. Worth every penny."),
      author: t("Jessica Walsh"),
      role: t("Medical Student")
    }
  ], [t])

  const testimonial = useMemo(() => {
    const seed = new Date().toDateString()
    let hash = 0
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash + seed.charCodeAt(i)) % STUDENT_TESTIMONIALS.length
    }
    return STUDENT_TESTIMONIALS[hash]
  }, [])

  return (
    <div className="bg-gray-900 py-16 sm:py-24">
      <div className="mx-auto max-w-4xl px-6 lg:px-8">
        <h2 className="text-3xl font-semibold tracking-tight text-white text-center mb-12">{t('What students say')}</h2>

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
  )
}
