import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { requireE2EDatabaseUrl } from "../helpers/env";

vi.mock("@/lib/redis", () => ({ redis: {} }));
import sql from "@/database/pgsql";
import {
  claimChatGeneration,
  createChatGeneration,
  finalizeChatGeneration,
} from "@/lib/chat/generation-store";
import { mapStoredChatMessages } from "@/lib/chat/hooks/use-chat-persistence";

const fixture = postgres(requireE2EDatabaseUrl(), { max: 1 });
const userId = randomUUID();
const sessionId = randomUUID();
beforeAll(async () => {
  await fixture`INSERT INTO app.login(user_id,email,hashed_password) VALUES (${userId},${`${userId}@example.test`},'synthetic')`;
  await fixture`INSERT INTO app.chat_sessions(id,user_id,title) VALUES (${sessionId},${userId},'JSON test')`;
});
afterAll(async () => {
  await fixture`DELETE FROM app.login WHERE user_id=${userId}`;
  await Promise.all([fixture.end(), sql.end()]);
});

describe("chat generation JSON round trip", () => {
  it.each(["completed", "failed"] as const)(
    "saves %s output as JSON containers and restores its ordered trace",
    async (status) => {
      const generationId = await createChatGeneration({
        userId,
        sessionId,
        message: "Synthetic question",
        useRag: false,
        thinkingMode: "auto",
        scope: {
          sessionContext: {
            scope: { notes: [], folders: [] },
            recentAccesses: [],
            lastFolder: null,
          },
          scopedNoteIds: null,
          scopedInputNoteIds: [],
          history: [],
        },
        requestOrigin: "http://localhost",
        respectPrivacySignal: false,
      });
      const claim = await claimChatGeneration(generationId);
      expect(claim?.generation.request_payload?.message).toBe(
        "Synthetic question",
      );
      if (!claim) throw new Error("Generation was not claimed");
      const parts = [
        { type: "reasoning" as const, text: "First" },
        {
          type: "tool" as const,
          name: "readNote",
          label: "Reading note",
          callId: "read-1",
          detail: "Input",
          resultDetail: "Result",
          status: "completed" as const,
        },
        { type: "reasoning" as const, text: "Second" },
        { type: "text" as const, text: "Answer" },
      ];
      const metadata = {
        thinking: "FirstSecond",
        partial: status === "failed",
        ...(status === "failed" && { error: "Interrupted" }),
      };
      expect(
        await finalizeChatGeneration(generationId, claim.leaseToken, status, {
          content: "Answer",
          parts,
          sources: [{ id: "source", title: "Source" }],
          metadata,
        }),
      ).toBe(true);
      expect(
        await finalizeChatGeneration(generationId, claim.leaseToken, status, {
          content: "Duplicate",
          parts,
        }),
      ).toBe(false);
      const messages =
        await fixture`SELECT * FROM app.chat_messages WHERE generation_id=${generationId}`;
      expect(messages).toHaveLength(1);
      expect(messages[0].parts).toEqual(parts);
      expect(messages[0].metadata).toEqual(metadata);
      expect(messages[0].sources).toEqual([{ id: "source", title: "Source" }]);
      expect(mapStoredChatMessages(messages)[0]).toMatchObject({
        parts,
        content: "Answer",
        partial: status === "failed",
      });
      const [generation] =
        await fixture`SELECT status, jsonb_typeof(request_payload) AS payload_type FROM app.chat_generations WHERE id=${generationId}`;
      expect(generation).toMatchObject({ status, payload_type: "object" });
      const [session] =
        await fixture`SELECT generation_status FROM app.chat_sessions WHERE id=${sessionId}`;
      expect(session.generation_status).toBe(
        status === "failed" ? "failed" : "idle",
      );
    },
  );
});
