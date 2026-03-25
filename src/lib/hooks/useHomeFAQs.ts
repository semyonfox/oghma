import { useMemo } from 'react'
import useI18n from '@/lib/notes/hooks/use-i18n'

export function useHomeFAQs() {
  const { t } = useI18n()

  return useMemo(
    () => [
      {
        question: t('What is OghmaNotes?'),
        answer: t('OghmaNotes is a RAG-powered learning platform that combines Markdown notes with semantic search and AI. Upload PDFs from lectures, ask questions about your materials with cited answers, and get adaptive quizzes and flashcards personalized to your learning pace.'),
      },
      {
        question: t('How does the RAG chat work?'),
        answer: t('Upload any PDF or document. The system extracts text, chunks it semantically, and stores embeddings in our vector database. When you ask a question, it retrieves relevant material and generates answers with direct citations so you know where information came from.'),
      },
      {
        question: t('Can I integrate Canvas deadlines?'),
        answer: t('Yes. Connect your Canvas account and OghmaNotes automatically syncs your courses, assignments, and deadlines daily. All your course materials are organized in one place with integrated calendar views.'),
      },
      {
        question: t('What are spaced repetition flashcards?'),
        answer: t('We use the SM-2 algorithm to schedule flashcard reviews at optimal intervals. The system learns which cards you struggle with and prioritizes them, scientifically proven to improve long-term retention.'),
      },
      {
        question: t('Do you generate quizzes automatically?'),
        answer: t('Absolutely. OghmaNotes generates adaptive quizzes from your notes and materials. Questions scale in difficulty based on your performance, giving you targeted practice on weak areas.'),
      },
      {
        question: t('Can I access my notes offline?'),
        answer: t('Yes! OghmaNotes is a Progressive Web App. Write and edit notes offline, and they sync automatically when you reconnect. Perfect for lecture halls and studying anywhere.'),
      },
    ],
    [t]
  )
}
