/**
 * Queue 5 random uncovered chunks for quiz question generation.
 *
 * Finds chunks without any quiz questions and generates questions for them.
 * Falls back to template questions if the LLM is unavailable.
 *
 * Usage:
 *   npx tsx scripts/queue-quiz-chunks.ts <user_id>
 *   npx tsx scripts/queue-quiz-chunks.ts          # picks first user in DB
 *
 * Environment: reads from .env.local then .env
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── env loading ───────────────────────────────────────────────────────────────

function loadEnv() {
  for (const filename of [".env.local", ".env"]) {
    const envPath = path.resolve(__dirname, "..", filename);
    if (!fs.existsSync(envPath)) continue;
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (key && !process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv();

const DB_URL = process.env.DATABASE_URL;
const LLM_URL = process.env.LLM_API_URL;
const LLM_KEY = process.env.LLM_API_KEY;
const BATCH_SIZE = 5;

if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = postgres(DB_URL, { ssl: "require", max: 3, connect_timeout: 15 });

// ── helpers ───────────────────────────────────────────────────────────────────

function bloomName(level: number): string {
  return (
    ["", "Remember", "Understand", "Apply", "Analyze"][level] ?? "Remember"
  );
}

function bloomDesc(level: number): string {
  const descs: Record<number, string> = {
    1: "Recall facts, definitions, and basic terminology",
    2: "Explain concepts in your own words, compare and contrast ideas",
    3: "Use knowledge to solve problems or apply to new situations",
    4: "Break down information, identify patterns, evaluate evidence",
  };
  return descs[level] ?? descs[1];
}

function pickType(level: number): string {
  const types: Record<number, string[]> = {
    1: ["mcq", "true_false"],
    2: ["mcq", "true_false", "fill_in"],
    3: ["mcq", "fill_in"],
    4: ["mcq", "fill_in"],
  };
  const opts = types[level] ?? ["mcq"];
  return opts[Math.floor(Math.random() * opts.length)];
}

function buildFallback(chunkText: string, moduleName: string, qtype: string) {
  const sentence =
    chunkText
      .replace(/\s+/g, " ")
      .trim()
      .split(/(?<=[.!?])\s+/)[0]
      ?.slice(0, 240) ?? chunkText.slice(0, 240);
  const answer = sentence || "Review the selected content.";
  if (qtype === "true_false") {
    return {
      question_text: `True or False: ${answer}`,
      options: JSON.stringify([
        { text: "True", is_correct: true },
        { text: "False", is_correct: false },
      ]),
      correct_answer: "True",
      explanation: `Generated from ${moduleName} notes.`,
    };
  }
  if (qtype === "fill_in") {
    return {
      question_text: "Fill in the blank: ____________",
      options: null,
      correct_answer: answer,
      explanation: `From ${moduleName} content.`,
    };
  }
  return {
    question_text: `Which statement is supported by your ${moduleName} notes?`,
    options: JSON.stringify([
      { text: answer, is_correct: true },
      { text: "A claim not present in the source notes", is_correct: false },
      { text: "An unrelated external fact", is_correct: false },
      { text: "A contradictory statement", is_correct: false },
    ]),
    correct_answer: answer,
    explanation: "Choose the option that directly matches the extracted chunk.",
  };
}

async function callLLM(prompt: string): Promise<string> {
  if (!LLM_URL || !LLM_KEY) throw new Error("LLM not configured");
  const res = await fetch(`${LLM_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LLM_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || "kimi-k2.5",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 512,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

function parseJson(raw: string) {
  try {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
    return JSON.parse(match[1]!.trim());
  } catch {
    return null;
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  let userId = process.argv[2];

  if (!userId) {
    const [first] = await sql`SELECT user_id FROM app.login LIMIT 1`;
    if (!first) {
      console.error("no users in database");
      await sql.end();
      process.exit(1);
    }
    userId = first.user_id;
    console.log(`no user_id provided — using first user: ${userId}`);
  }

  // get up to BATCH_SIZE uncovered chunks
  const chunks = await sql`
    SELECT c.id, c.text, c.document_id, n.title, n.canvas_course_id
    FROM app.chunks c
    JOIN app.notes n ON c.document_id = n.note_id
    WHERE c.user_id = ${userId}::uuid
      AND NOT EXISTS (
        SELECT 1 FROM app.quiz_questions qq
        WHERE qq.chunk_id = c.id AND qq.user_id = ${userId}::uuid
      )
    ORDER BY random()
    LIMIT ${BATCH_SIZE}
  `;

  if (chunks.length === 0) {
    console.log("all chunks already have quiz questions — nothing to do");
    await sql.end();
    return;
  }

  console.log(
    `found ${chunks.length} uncovered chunk(s) — generating questions…\n`,
  );

  let generated = 0;

  for (const chunk of chunks as unknown as Array<{
    id: string;
    text: string;
    document_id: string;
    title: string;
    canvas_course_id: number | null;
  }>) {
    const bloomLevel = 1; // always start new chunks at Remember
    const qtype = pickType(bloomLevel);
    const moduleName = chunk.title || "Unknown Module";

    console.log(
      `  chunk ${chunk.id.slice(0, 8)}…  module="${moduleName}"  type=${qtype}`,
    );

    let questionData: {
      question_text: string;
      options: string | null;
      correct_answer: string;
      explanation: string;
    };

    try {
      const prompt = `You are generating a study question from university lecture notes.

Content from the student's notes:
---
${chunk.text.slice(0, 1800)}
---

Module: ${moduleName}
Question type: ${qtype}
Target cognitive level: ${bloomName(bloomLevel)} (Bloom's Taxonomy level ${bloomLevel})
${bloomDesc(bloomLevel)}

${qtype === "mcq" ? "Generate a multiple choice question with exactly 4 options. Exactly one option must be correct." : qtype === "true_false" ? 'Generate a true/false question. Set options to [{"text":"True","is_correct":true/false},{"text":"False","is_correct":true/false}].' : "Generate a fill-in-the-blank question. Set options to null."}

Return ONLY valid JSON: {"question_text":"...","options":[...],"correct_answer":"...","explanation":"..."}`;

      const raw = await callLLM(prompt);
      const parsed = parseJson(raw);
      if (parsed?.question_text?.trim() && parsed?.correct_answer?.trim()) {
        questionData = {
          question_text: parsed.question_text,
          options: parsed.options ? JSON.stringify(parsed.options) : null,
          correct_answer: parsed.correct_answer,
          explanation: parsed.explanation ?? "",
        };
        console.log(
          `    ✓ LLM generated: "${questionData.question_text.slice(0, 70)}…"`,
        );
      } else {
        throw new Error("invalid LLM response");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`    ! LLM failed (${msg}) — using fallback template`);
      questionData = buildFallback(chunk.text, moduleName, qtype);
    }

    // generate a deterministic UUID from chunk id for idempotency
    const questionId = crypto.randomUUID();
    const cardId = crypto.randomUUID();

    try {
      // skip if question already exists for this chunk + level
      const [existing] = await sql`
        SELECT id FROM app.quiz_questions
        WHERE chunk_id = ${chunk.id}::uuid AND user_id = ${userId}::uuid AND bloom_level = ${bloomLevel}
        LIMIT 1
      `;
      if (existing) {
        console.log(`    ~ already exists, skipping`);
        continue;
      }

      await sql`
        INSERT INTO app.quiz_questions (id, user_id, note_id, chunk_id, question_type, bloom_level, question_text, options, correct_answer, explanation)
        VALUES (${questionId}::uuid, ${userId}::uuid, ${chunk.document_id}::uuid, ${chunk.id}::uuid,
                ${qtype}, ${bloomLevel}, ${questionData.question_text},
                ${questionData.options ?? null}::jsonb, ${questionData.correct_answer}, ${questionData.explanation})
      `;
      await sql`
        INSERT INTO app.quiz_cards (id, user_id, question_id)
        VALUES (${cardId}::uuid, ${userId}::uuid, ${questionId}::uuid)
      `;
      generated++;
      console.log(
        `    ✓ saved (question ${questionId.slice(0, 8)}…, card ${cardId.slice(0, 8)}…)`,
      );
    } catch (err) {
      console.error(
        `    ✗ DB error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(`\ndone — generated ${generated}/${chunks.length} question(s)`);
  await sql.end();
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
