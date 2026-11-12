"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { browserTimeZone } from "@/lib/quiz/time-zone";

const meSchema = z.object({
  user: z.object({
    email: z.string(),
    displayName: z.string().nullable().optional(),
    avatarUrl: z.string().nullable().optional(),
  }),
});

const quizSchema = z.object({ dueCount: z.number() });

export interface SidebarSummary {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  dueCount: number | null;
}

const EMPTY: SidebarSummary = { name: null, email: null, avatarUrl: null, dueCount: null };

// the sidebar is decoration on top of each page, so a failed request just
// leaves its slot empty instead of surfacing an error
async function readJson<T>(url: string, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export default function useSidebarSummary(): SidebarSummary {
  const [summary, setSummary] = useState<SidebarSummary>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    const tz = encodeURIComponent(browserTimeZone());
    void Promise.all([
      readJson("/api/auth/me", meSchema),
      readJson(`/api/quiz/dashboard?tz=${tz}`, quizSchema),
    ]).then(([me, quiz]) => {
      if (cancelled) return;
      setSummary({
        name: me?.user.displayName ?? null,
        email: me?.user.email ?? null,
        avatarUrl: me?.user.avatarUrl ?? null,
        dueCount: quiz?.dueCount ?? null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return summary;
}
