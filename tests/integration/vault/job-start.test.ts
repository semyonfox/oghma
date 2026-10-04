import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { NextRequest } from "next/server";
import { requireE2EDatabaseUrl } from "../helpers/env";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(async () => undefined),
  requireAuth: vi.fn(),
  s3Send: vi.fn(async () => ({
    ContentLength: 12,
    Metadata: { "expected-size": "12" },
  })),
}));

vi.mock("@/lib/api-error", () => {
  class ApiError extends Error {
    constructor(
      readonly statusCode: number,
      readonly userMessage: string,
      readonly internalDetails?: string,
    ) {
      super(userMessage);
    }
  }

  return {
    ApiError,
    requireAuth: mocks.requireAuth,
    withErrorHandler:
      (handler: (request: NextRequest) => Promise<Response>) =>
      async (request: NextRequest) => {
        try {
          return await handler(request);
        } catch (error) {
          const status = error instanceof ApiError ? error.statusCode : 500;
          const message = error instanceof ApiError
            ? error.userMessage
            : "Internal server error";
          return Response.json({ error: message }, { status });
        }
      },
  };
});
vi.mock("@/lib/queue", () => ({ enqueueCanvasJob: mocks.enqueue }));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = mocks.s3Send;
  },
  HeadObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
}));
vi.mock("@/lib/storage/s3", () => ({
  createS3ClientConfig: vi.fn(() => ({})),
  createS3ConfigFromEnv: vi.fn(() => ({ bucket: "test" })),
}));

import appSql from "@/database/pgsql";
import { POST as startVaultExport } from "@/app/api/vault/export/route";
import { POST as startVaultImport } from "@/app/api/vault/import/start/route";

const fixtureSql = postgres(requireE2EDatabaseUrl(), { max: 4 });
let userId: string;

function exportRequest(): NextRequest {
  return new NextRequest("http://localhost/api/vault/export", {
    method: "POST",
  });
}

function importRequest(): NextRequest {
  return new NextRequest("http://localhost/api/vault/import/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      s3Key: `vault-uploads/${userId}/upload/vault.zip`,
    }),
  });
}

async function activeJobs(type: "vault-export" | "vault-import") {
  return fixtureSql`
    SELECT id, status, error_message, completed_at
    FROM app.canvas_import_jobs
    WHERE user_id = ${userId}::uuid
      AND type = ${type}
      AND status IN ('queued', 'processing')
  `;
}

beforeEach(async () => {
  userId = randomUUID();
  vi.clearAllMocks();
  mocks.enqueue.mockReset().mockResolvedValue(undefined);
  mocks.requireAuth.mockResolvedValue({ user_id: userId });
  process.env.STORAGE_BUCKET = "test";

  await fixtureSql`
    INSERT INTO app.login (user_id, email, hashed_password)
    VALUES (${userId}::uuid, ${`${userId}@example.test`}, 'unused')
  `;
});

afterEach(async () => {
  delete process.env.STORAGE_BUCKET;
  delete process.env.STORAGE_PREFIX;
  await fixtureSql`
    DELETE FROM app.canvas_import_jobs WHERE user_id = ${userId}::uuid
  `;
  await fixtureSql`DELETE FROM app.login WHERE user_id = ${userId}::uuid`;
});

afterAll(async () => {
  await Promise.all([fixtureSql.end(), appSql.end()]);
});

describe("vault job start durability", () => {
  it("creates and publishes exactly one export under concurrent starts", async () => {
    const responses = await Promise.all([
      startVaultExport(exportRequest()),
      startVaultExport(exportRequest()),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(mocks.enqueue).toHaveBeenCalledOnce();

    const success = responses.find(({ status }) => status === 200);
    const conflict = responses.find(({ status }) => status === 409);
    if (!success || !conflict) {
      throw new Error("expected one successful and one conflicting response");
    }
    const successBody = await success.json();
    await expect(conflict.json()).resolves.toMatchObject({
      activeJobId: successBody.jobId,
    });

    await expect(activeJobs("vault-export")).resolves.toHaveLength(1);
  });

  it.each([
    ["vault-export" as const, () => startVaultExport(exportRequest())],
    ["vault-import" as const, () => startVaultImport(importRequest())],
  ])(
    "marks a failed %s publication durably and permits a retry",
    async (type, start) => {
      mocks.enqueue.mockRejectedValueOnce(new Error("queue unavailable"));

      const failedResponse = await start();
      expect(failedResponse.status).toBe(500);
      await expect(activeJobs(type)).resolves.toHaveLength(0);

      const [failedJob] = await fixtureSql`
        SELECT status, error_message, completed_at
        FROM app.canvas_import_jobs
        WHERE user_id = ${userId}::uuid AND type = ${type}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      expect(failedJob).toMatchObject({
        status: "failed",
        error_message: "Failed to enqueue job",
        completed_at: expect.any(Date),
      });

      const retryResponse = await start();
      expect(retryResponse.status).toBe(200);
      await expect(activeJobs(type)).resolves.toHaveLength(1);
      expect(mocks.enqueue).toHaveBeenCalledTimes(2);
    },
  );
});
