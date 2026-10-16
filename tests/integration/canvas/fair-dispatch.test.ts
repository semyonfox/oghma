import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { requireE2EDatabaseUrl } from "../helpers/env";
import appSql from "@/database/pgsql";
import { dispatchFairCanvasFiles } from "@/lib/canvas/import-scheduler";

const mocks = vi.hoisted(() => ({ enqueue: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/queue", () => ({ enqueueCanvasJob: mocks.enqueue }));

const fixtureSql = postgres(requireE2EDatabaseUrl(), { max: 2 });
let userId: string;
let jobId: string;
let importId: string;

beforeEach(async () => {
  userId = randomUUID();
  jobId = randomUUID();
  importId = randomUUID();
  mocks.enqueue.mockClear();
  await fixtureSql`
    INSERT INTO app.login (user_id, email, hashed_password, email_verified, is_active)
    VALUES (${userId}::uuid, ${`fair-dispatch-${userId}@example.test`}, 'unused', true, true)
  `;
  await fixtureSql`
    INSERT INTO app.canvas_import_jobs (id, user_id, type, status, course_ids)
    VALUES (${jobId}::uuid, ${userId}::uuid, 'canvas', 'processing', '["42"]')
  `;
  await fixtureSql`
    INSERT INTO app.canvas_imports (id, job_id, user_id, status, canvas_course_id, canvas_file_id,
      canvas_module_id, filename, mime_type, s3_prefix)
    VALUES (${importId}::uuid, ${jobId}::uuid, ${userId}::uuid, 'pending', 42, 42, -1,
      'Lecture.pdf', 'application/pdf', 'test')
  `;
});

afterEach(async () => {
  await fixtureSql`DELETE FROM app.canvas_imports WHERE user_id = ${userId}::uuid`;
  await fixtureSql`DELETE FROM app.canvas_import_jobs WHERE user_id = ${userId}::uuid`;
  await fixtureSql`DELETE FROM app.import_scheduler_users WHERE user_id = ${userId}::uuid`;
  await fixtureSql`DELETE FROM app.login WHERE user_id = ${userId}::uuid`;
});

afterAll(async () => {
  await Promise.all([fixtureSql.end(), appSql.end()]);
});

describe("fair Canvas file dispatch", () => {
  it("never dispatches a pending Canvas file for a deactivated account", async () => {
    await fixtureSql`UPDATE app.login SET is_active = false, deleted_at = NOW() WHERE user_id = ${userId}::uuid`;

    await dispatchFairCanvasFiles(10);

    const [file] = await fixtureSql<{ dispatched_at: Date | null }[]>`
      SELECT dispatched_at FROM app.canvas_imports WHERE id = ${importId}::uuid
    `;
    expect(file.dispatched_at).toBeNull();
    expect(mocks.enqueue).not.toHaveBeenCalledWith(
      "canvas-file",
      expect.objectContaining({ importRecordId: importId }),
    );
  });
});
