"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import useI18n from "@/lib/notes/hooks/use-i18n";

export default function TestimonialSection() {
  const { t } = useI18n();

  const testimonials = useMemo(
    () => [
      {
        quote: t(
          "The Canvas integration is a game-changer. My notes are automatically synced, and the AI insights help me actually understand the material.",
        ),
        author: t("Marcus Johnson"),
        role: t("Engineering Student"),
      },
      {
        quote: t(
          "Finally, a note-taking app built for students. The markdown editor is smooth, and the AI study questions keep me accountable.",
        ),
        author: t("Emma Rodriguez"),
        role: t("Biology Student"),
      },
      {
        quote: t(
          "I love how minimal and focused OghmaNotes is. No distractions, just powerful tools for learning. Highly recommend to any student.",
        ),
        author: t("David Kim"),
        role: t("Economics Student"),
      },
      {
        quote: t(
          "The AI-powered insights are incredible. It summarizes lectures in seconds and generates study guides automatically. Worth every penny.",
        ),
        author: t("Jessica Walsh"),
        role: t("Medical Student"),
      },
    ],
    [t],
  );

  return (
    <div className="bg-surface py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
          className="font-serif text-3xl font-semibold tracking-tight text-white text-center mb-12"
        >
          {t("What students say")}
        </motion.h2>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {testimonials.map((item, i) => (
            <motion.div
              key={item.author}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="rounded-xl bg-white/5 ring-1 ring-white/10 p-8"
            >
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, j) => (
                  <span key={j} className="text-yellow-400 text-sm">
                    &#9733;
                  </span>
                ))}
              </div>
              <p className="font-serif text-base/7 text-text italic mb-6">
                &ldquo;{item.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-400 font-semibold text-sm">
                  {item.author.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">
                    {item.author}
                  </p>
                  <p className="text-xs text-text-tertiary">{item.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
