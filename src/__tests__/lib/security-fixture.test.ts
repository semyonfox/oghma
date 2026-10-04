import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import sql from "@/database/pgsql";
import {
  reserveVaultUpload,
  reserveVaultExport,
  cleanupVaultArtifacts,
} from "@/lib/vault/artifacts";
import { findOrCreateOAuthUser } from "@/lib/auth/oauth";
import { proposeToolAction, confirmChatTools } from "@/lib/chat/actions";
import { tool } from "ai";
import { z } from "zod";
import { POST as approve } from "@/app/api/chat/actions/[id]/route";
import bcrypt from "bcryptjs";
import { POST as verifyEmail } from "@/app/api/auth/verify-email/route";
import { POST as resetPassword } from "@/app/api/auth/password-reset/verify/route";
import { hashToken } from "@/lib/auth/tokens";
import { GET as calendar } from "@/app/api/calendar/ical/[token]/route";
import { DELETE as deleteAccount } from "@/app/api/auth/delete-account/route";
import {
  queueVaultStorageCleanup,
  processPendingNoteDeletionCleanup,
} from "@/lib/notes/storage/note-lifecycle";

const mocks = vi.hoisted(() => ({
  deleteObject: vi.fn(),
  deletePrefix: vi.fn(),
  validateSession: vi.fn(),
  canvasCredentials: vi.fn(),
}));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  validateSession: mocks.validateSession,
  createAuthSession: vi
    .fn()
    .mockResolvedValue(Response.json({ success: true })),
}));
vi.mock("@/lib/canvas/credentials", () => ({
  loadCanvasCredentials: mocks.canvasCredentials,
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/storage/init", () => ({
  getStorageProvider: () => ({
    deleteObject: mocks.deleteObject,
    deletePrefix: mocks.deletePrefix,
  }),
}));
vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/notes/storage/create-note", () => ({
  insertNoteWithTree: vi.fn(),
}));
const userId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";
const thirdId = "00000000-0000-4000-8000-000000000003";
const sessionId = "00000000-0000-4000-8000-000000000004";
const blockId = "00000000-0000-4000-8000-000000000005";
const calendarToken = "00000000-0000-4000-8000-000000000006";
const fixture = process.env.SECURITY_FIXTURE_DB === "1";

beforeAll(async () => {
  if (!fixture) return;
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.hostname !== "127.0.0.1" ||
    url.port !== "57432" ||
    url.pathname !== "/postgres"
  )
    throw new Error("Disposable security database required");
  const postgres = (await import("postgres")).default;
  const setup = postgres(url.toString(), { onnotice: () => {} });
  await setup.unsafe(`DROP SCHEMA IF EXISTS app CASCADE; CREATE SCHEMA app;
    CREATE TABLE app.login (user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL, hashed_password text NOT NULL,
      email_verified boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true, deleted_at timestamptz,
      verification_token text, verification_token_expires timestamptz, reset_token text, reset_token_expires timestamptz,
      calendar_export_token uuid, display_name text, avatar_url text, locale text, welcome_note_id uuid);
    CREATE TABLE app.oauth_accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES app.login(user_id),
      provider text, provider_id text, email text, name text, avatar_url text, locale text, raw_profile jsonb, UNIQUE(provider,provider_id));
    CREATE TABLE app.canvas_import_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES app.login(user_id),
      type text, status text, output_s3_key text, input_s3_key text, created_at timestamptz NOT NULL DEFAULT NOW(), completed_at timestamptz);
    CREATE TABLE app.note_deletion_cleanup_tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
      object_keys text[], object_prefixes text[], note_ids uuid[], chunk_ids uuid[], lease_token uuid,
      lease_expires_at timestamptz, completed_at timestamptz, attempts int NOT NULL DEFAULT 0, last_error text,
      created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW());
    CREATE TABLE app.agent_registration_claims (id uuid PRIMARY KEY, created_user_id uuid, status text, expires_at timestamptz, verified_at timestamptz);
    CREATE TABLE app.chat_sessions (id uuid PRIMARY KEY, user_id uuid REFERENCES app.login(user_id));
    CREATE TABLE app.time_blocks (id uuid PRIMARY KEY, user_id uuid REFERENCES app.login(user_id), completed boolean DEFAULT false);`);
  for (const name of [
    "072_account_session_version.sql",
    "073_vault_artifact_retention.sql",
    "074_chat_tool_confirmation.sql",
    "075_normalized_account_email.sql",
  ]) {
    await setup.begin(async (tx) => {
      await tx.unsafe(await readFile(`database/migrations/${name}`, "utf8"));
    });
  }
  await setup.end();
});

beforeEach(async () => {
  if (!fixture) return;
  const postgres = (await import("postgres")).default;
  const setup = postgres(process.env.DATABASE_URL ?? "", {
    onnotice: () => {},
  });
  await setup.unsafe("TRUNCATE app.login CASCADE");
  await setup.unsafe("TRUNCATE app.note_deletion_cleanup_tasks");
  await setup.end();
  for (const [id, email] of [
    [userId, "owner@example.test"],
    [secondId, "second@example.test"],
    [thirdId, "third@example.test"],
  ]) {
    await sql`INSERT INTO app.login (user_id,email,hashed_password,email_verified,calendar_export_token) VALUES (${id}::uuid,${email},'attacker-password',true,${id === userId ? calendarToken : null}::uuid)`;
  }
  await sql`INSERT INTO app.chat_sessions VALUES (${sessionId}::uuid,${userId}::uuid)`;
  await sql`INSERT INTO app.time_blocks VALUES (${blockId}::uuid,${userId}::uuid,false)`;
  mocks.canvasCredentials
    .mockReset()
    .mockResolvedValue({
      domain: "canvas.example.test",
      token: "synthetic-token",
    });
  mocks.deleteObject.mockReset().mockResolvedValue(undefined);
  mocks.deletePrefix.mockReset().mockResolvedValue(undefined);
  mocks.validateSession.mockResolvedValue({
    user_id: userId,
    email: "owner@example.test",
    session_version: 0,
  });
});
afterAll(async () => {
  if (fixture) await sql.end();
});

function approvalRequest() {
  return new NextRequest("https://example.test/api/chat/actions/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "approve" }),
  });
}

describe.skipIf(!fixture)("security contracts in disposable PostgreSQL", () => {
  it("retains recent legacy export links until their original24-hour expiry and journals only expired copies", async () => {
    const oldKey = `exports/${userId}/legacy-old/vault-export.zip`;
    const recentKeys = [
      `exports/${userId}/legacy-recent/vault-export.zip`,
      `exports/${userId}/legacy-newest/vault-export.zip`,
    ];
    await sql`INSERT INTO app.canvas_import_jobs(user_id,type,status,output_s3_key,completed_at)
      VALUES (${userId}::uuid,'vault-export','complete',${oldKey},NOW() - INTERVAL '2 days'),
        (${userId}::uuid,'vault-export','complete',${recentKeys[0]},NOW() - INTERVAL '2 hours'),
        (${userId}::uuid,'vault-export','complete',${recentKeys[1]},NOW() - INTERVAL '1 hour')`;
    await sql`DROP TABLE app.vault_artifacts`;
    await sql.begin(async (tx) => {
      await tx.unsafe(
        await readFile(
          "database/migrations/073_vault_artifact_retention.sql",
          "utf8",
        ),
      );
    });
    const archives =
      await sql`SELECT s3_key, is_current, expires_at > NOW() AS retained FROM app.vault_artifacts ORDER BY s3_key`;
    expect(archives).toHaveLength(2);
    expect(archives.every((row) => row.retained)).toBe(true);
    expect(
      archives.filter((row) => row.is_current).map((row) => row.s3_key),
    ).toEqual([recentKeys[1]]);
    const [journal] =
      await sql`SELECT object_keys FROM app.note_deletion_cleanup_tasks`;
    expect(journal.object_keys).toEqual([oldKey]);
  });
  it("serialises same-user reservations and enforces the shared byte budget", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        reserveVaultUpload(
          userId,
          `vault-uploads/${userId}/${index}/a.zip`,
          10 * 1024 ** 3,
        ),
      ),
    );
    expect(
      attempts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(8);
    const [usage] =
      await sql`SELECT COUNT(*)::int AS count FROM app.vault_artifacts WHERE kind = 'upload'`;
    expect(usage.count).toBe(1);
    await reserveVaultUpload(
      secondId,
      `vault-uploads/${secondId}/a.zip`,
      10 * 1024 ** 3,
    );
    await expect(
      reserveVaultUpload(thirdId, `vault-uploads/${thirdId}/a.zip`, 1),
    ).rejects.toMatchObject({ statusCode: 429 });
  });
  it("holds expired reservations until object deletion succeeds", async () => {
    await reserveVaultUpload(userId, `vault-uploads/${userId}/a.zip`, 12);
    await sql`UPDATE app.vault_artifacts SET expires_at = NOW() - INTERVAL '1 minute'`;
    mocks.deleteObject.mockRejectedValueOnce(new Error("synthetic outage"));
    await expect(cleanupVaultArtifacts()).rejects.toThrow("synthetic outage");
    const [retained] =
      await sql`SELECT SUM(reserved_bytes)::int AS bytes FROM app.vault_artifacts`;
    expect(retained.bytes).toBe(12);
    await expect(cleanupVaultArtifacts()).resolves.toBe(1);
    await reserveVaultUpload(userId, `vault-uploads/${userId}/b.zip`, 12);
  });
  it("permits a second import and a changed failed upload while retaining old signed-key accounting", async () => {
    const first = await reserveVaultUpload(
      userId,
      `vault-uploads/${userId}/a.zip`,
      12,
    );
    const [job] =
      await sql`INSERT INTO app.canvas_import_jobs(user_id,type,status) VALUES (${userId}::uuid,'vault-import','complete') RETURNING id`;
    await sql`UPDATE app.vault_artifacts SET job_id = ${job.id}::uuid WHERE s3_key = ${first}`;
    await reserveVaultUpload(userId, `vault-uploads/${userId}/b.zip`, 14);
    await reserveVaultUpload(userId, `vault-uploads/${userId}/c.zip`, 16);
    const [usage] =
      await sql`SELECT COUNT(*)::int AS count, COUNT(*) FILTER (WHERE is_current)::int AS current, SUM(reserved_bytes)::int AS bytes FROM app.vault_artifacts`;
    expect(usage).toEqual({ count: 3, current: 1, bytes: 42 });
  });
  it("continues expired cleanup after a failed object deletion without releasing its quota", async () => {
    const failedKey = await reserveVaultUpload(
      userId,
      `vault-uploads/${userId}/a.zip`,
      12,
    );
    const otherKey = await reserveVaultUpload(
      secondId,
      `vault-uploads/${secondId}/b.zip`,
      14,
    );
    await sql`UPDATE app.vault_artifacts SET expires_at = NOW() - INTERVAL '1 minute'`;
    mocks.deleteObject.mockImplementation(async (key: string) => {
      if (key === failedKey) throw new Error("synthetic isolated failure");
    });
    await expect(cleanupVaultArtifacts()).rejects.toThrow(
      "synthetic isolated failure",
    );
    const remaining =
      await sql`SELECT s3_key, reserved_bytes::int AS bytes FROM app.vault_artifacts`;
    expect(remaining).toEqual([{ s3_key: failedKey, bytes: 12 }]);
    expect(mocks.deleteObject).toHaveBeenCalledWith(
      otherKey,
      expect.any(AbortSignal),
    );
  });
  it("retries clear-vault cleanup using only the export keys present at the clear boundary", async () => {
    const oldKey = `exports/${userId}/old/vault-export.zip`;
    const newKey = `exports/${userId}/new/vault-export.zip`;
    const oldJobId = "00000000-0000-4000-8000-000000000010";
    const newJobId = "00000000-0000-4000-8000-000000000011";
    const oldUpload = `vault-uploads/${userId}/old.zip`;
    const newUpload = `vault-uploads/${userId}/new.zip`;
    await sql`INSERT INTO app.canvas_import_jobs(id,user_id,type,status,input_s3_key,created_at)
      VALUES (${oldJobId}::uuid,${userId}::uuid,'vault-import','cancelled',${oldUpload},NOW() - INTERVAL '1 day'),
        (${newJobId}::uuid,${userId}::uuid,'vault-import','queued',${newUpload},NOW() + INTERVAL '1 minute')`;
    await sql`INSERT INTO app.vault_artifacts(user_id,kind,s3_key,reserved_bytes,expires_at,created_at,is_current)
      VALUES (${userId}::uuid,'export',${oldKey},0,NOW() + INTERVAL '1 day',NOW() - INTERVAL '1 day',false),
        (${userId}::uuid,'export',${newKey},0,NOW() + INTERVAL '1 day',NOW() + INTERVAL '1 minute',true),
        (${userId}::uuid,'upload',${oldUpload},12,NOW() + INTERVAL '1 day',NOW() - INTERVAL '1 day',false),
        (${userId}::uuid,'upload',${newUpload},14,NOW() + INTERVAL '1 day',NOW() + INTERVAL '1 minute',true)`;
    mocks.deleteObject.mockRejectedValueOnce(new Error("synthetic retry"));
    expect(await queueVaultStorageCleanup(userId, new Date())).toBe(true);
    const [pending] =
      await sql`SELECT object_keys, object_prefixes FROM app.note_deletion_cleanup_tasks`;
    expect([...pending.object_keys].sort()).toEqual([oldKey, oldUpload].sort());
    expect(pending.object_prefixes).toEqual([`vault/${userId}/${oldJobId}/`]);
    expect(await processPendingNoteDeletionCleanup()).toBe(1);
    expect(mocks.deleteObject).not.toHaveBeenCalledWith(newKey);
    expect(mocks.deleteObject).not.toHaveBeenCalledWith(newUpload);
    expect(mocks.deletePrefix).toHaveBeenCalledWith(
      `vault/${userId}/${oldJobId}/`,
    );
    expect(mocks.deletePrefix).not.toHaveBeenCalledWith(
      `vault/${userId}/${newJobId}/`,
    );
    expect(mocks.deletePrefix.mock.calls.flat()).not.toContain(
      `exports/${userId}/`,
    );
    expect(
      await sql`SELECT id FROM app.note_deletion_cleanup_tasks`,
    ).toHaveLength(0);
  });
  it("retires an upload key atomically before delayed clear cleanup can delete a same-file retry", async () => {
    const oldKey = await reserveVaultUpload(
      userId,
      `vault-uploads/${userId}/old/a.zip`,
      12,
    );
    mocks.deleteObject.mockRejectedValueOnce(
      new Error("synthetic deferred clear"),
    );
    expect(
      await queueVaultStorageCleanup(userId, new Date(Date.now() + 1000)),
    ).toBe(true);
    const newKey = await reserveVaultUpload(
      userId,
      `vault-uploads/${userId}/new/a.zip`,
      12,
    );
    expect(newKey).not.toBe(oldKey);
    expect(await processPendingNoteDeletionCleanup()).toBe(1);
    expect(mocks.deleteObject.mock.calls.map((call) => call[0])).toEqual([
      oldKey,
      oldKey,
    ]);
    expect(mocks.deleteObject).not.toHaveBeenCalledWith(newKey);
    const [usage] =
      await sql`SELECT COUNT(*)::int AS count, COUNT(*) FILTER (WHERE is_current)::int AS current, SUM(reserved_bytes)::int AS bytes FROM app.vault_artifacts`;
    expect(usage).toEqual({ count: 2, current: 1, bytes: 24 });
  });
  it("replaces completed exports and removes expired exports, without growing the archive count", async () => {
    const [old] = await sql<
      { id: string }[]
    >`INSERT INTO app.canvas_import_jobs(user_id,type,status) VALUES (${userId}::uuid,'vault-export','complete') RETURNING id`;
    await sql.begin((tx) => reserveVaultExport(tx, userId, old.id));
    const [next] = await sql<
      { id: string }[]
    >`INSERT INTO app.canvas_import_jobs(user_id,type,status) VALUES (${userId}::uuid,'vault-export','complete') RETURNING id`;
    await sql.begin((tx) => reserveVaultExport(tx, userId, next.id));
    expect(mocks.deleteObject).toHaveBeenCalledWith(
      `exports/${userId}/${old.id}/vault-export.zip`,
      expect.any(AbortSignal),
    );
    const [count] = await sql<
      { count: number }[]
    >`SELECT COUNT(*)::int AS count FROM app.vault_artifacts`;
    expect(count.count).toBe(1);
    await sql`UPDATE app.vault_artifacts SET expires_at = NOW() - INTERVAL '1 minute'`;
    await expect(cleanupVaultArtifacts()).resolves.toBe(1);
  });
  it("reclaims an unverified registration under concurrent OAuth sign-ins without retaining its password or epoch", async () => {
    await sql`UPDATE app.login SET email_verified = false, verification_token = 'synthetic', reset_token = 'synthetic' WHERE user_id = ${userId}::uuid`;
    const profile = {
      provider: "google",
      providerAccountId: "synthetic-owner",
      email: "owner@example.test",
    };
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        findOrCreateOAuthUser(profile, { email_verified: true }),
      ),
    );
    expect(new Set(results)).toEqual(new Set([userId]));
    const [account] =
      await sql`SELECT hashed_password, session_version, email_verified, reset_token, verification_token FROM app.login WHERE user_id = ${userId}::uuid`;
    expect(account.hashed_password).not.toBe("attacker-password");
    expect(account).toMatchObject({
      session_version: 1,
      email_verified: true,
      reset_token: null,
      verification_token: null,
    });
  });
  it("makes injected local and Canvas mutation calls proposals without executing them", async () => {
    const execute = vi.fn();
    const tools = confirmChatTools(
      {
        renameNote: tool({
          inputSchema: z.object({ newTitle: z.string() }),
          execute,
        }),
        canvas_send_conversation: tool({
          inputSchema: z.object({ body: z.string() }),
          execute,
        }),
      },
      userId,
      sessionId,
    );
    for (const name of Object.keys(tools)) {
      const definition = tools[name];
      if (!definition.execute) throw new Error("Expected tool");
      // an SDK caller validates the schema and invokes the dynamic tool
      const result: unknown = await Reflect.apply(definition.execute, null, [
        { newTitle: "injected", body: "injected" },
        { context: {}, messages: [], toolCallId: "synthetic" },
      ]);
      expect(result).toMatchObject({ requiresConfirmation: true });
    }
    expect(execute).not.toHaveBeenCalled();
  });
  it("rejects a Canvas approval when its connection changed since the proposal", async () => {
    const proposal = await proposeToolAction(
      userId,
      null,
      "canvas_send_conversation",
      { recipients: ["1"], body: "synthetic" },
    );
    const [stored] =
      await sql`SELECT target_origin FROM app.chat_tool_actions WHERE id = ${proposal.actionId}::uuid`;
    expect(stored.target_origin).toBe("https://canvas.example.test");
    mocks.canvasCredentials.mockResolvedValue({
      domain: "canvas.example.test",
      token: "different-synthetic-account",
    });
    expect(
      (
        await approve(approvalRequest(), {
          params: Promise.resolve({ id: proposal.actionId }),
        })
      ).status,
    ).toBe(502);
    const [action] =
      await sql`SELECT status FROM app.chat_tool_actions WHERE id = ${proposal.actionId}::uuid`;
    expect(action.status).toBe("failed");
  });
  it("executes an approved local action after schema validation", async () => {
    const { createChatTools } = await import("@/lib/chat/build-stream");
    await createChatTools(
      userId,
      sessionId,
      null,
      {},
      false,
    ).executeApprovedAction("completeTimeBlock", { blockId });
    const [row] =
      await sql`SELECT completed FROM app.time_blocks WHERE id = ${blockId}::uuid`;
    expect(row.completed).toBe(true);
  });
  it("claims approval once under concurrency, rejects another account, and rejects altered payloads", async () => {
    const proposal = await proposeToolAction(
      userId,
      sessionId,
      "completeTimeBlock",
      { blockId },
    );
    const context = { params: Promise.resolve({ id: proposal.actionId }) };
    mocks.validateSession.mockResolvedValueOnce({
      user_id: secondId,
      email: "second@example.test",
      session_version: 0,
    });
    expect((await approve(approvalRequest(), context)).status).toBe(409);
    const altered = new NextRequest(approvalRequest().url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "approve",
        input: { blockId: "other" },
      }),
    });
    expect((await approve(altered, context)).status).toBe(400);
    for (const decision of [
      ["reject"],
      ["approve"],
      { value: "approve" },
      null,
    ]) {
      const invalid = new NextRequest(approvalRequest().url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      expect((await approve(invalid, context)).status).toBe(400);
    }
    const [pending] =
      await sql`SELECT status, jsonb_typeof(input) AS input_type FROM app.chat_tool_actions WHERE id = ${proposal.actionId}::uuid`;
    expect(pending).toMatchObject({ status: "pending", input_type: "object" });
    const results = await Promise.all([
      approve(approvalRequest(), context),
      approve(approvalRequest(), context),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const [block] =
      await sql`SELECT completed FROM app.time_blocks WHERE id = ${blockId}::uuid`;
    expect(block.completed).toBe(true);
  });
  it("claims an existing mixed-case mailbox without creating a duplicate account", async () => {
    await sql`UPDATE app.login SET email = 'Owner@Example.Test', email_verified = false WHERE user_id = ${userId}::uuid`;
    const linked = await findOrCreateOAuthUser(
      {
        provider: "google",
        providerAccountId: "synthetic-case-owner",
        email: "owner@example.test",
      },
      { email_verified: true },
    );
    expect(linked).toBe(userId);
    const [count] = await sql`SELECT COUNT(*)::int AS count FROM app.login`;
    expect(count.count).toBe(3);
    await expect(
      sql`INSERT INTO app.login(email,hashed_password) VALUES ('OWNER@example.test','synthetic')`,
    ).rejects.toMatchObject({ code: "23505" });
  });
  it("email verification replaces the pre-registrant password and consumes the token once", async () => {
    await sql`UPDATE app.login SET email_verified = false, verification_token = ${hashToken("synthetic-verification")}, verification_token_expires = NOW() + INTERVAL '1 hour' WHERE user_id = ${userId}::uuid`;
    const request = (password?: string) =>
      new NextRequest("https://example.test/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "synthetic-verification", password }),
      });
    expect((await verifyEmail(request())).status).toBe(400);
    const results = await Promise.all([
      verifyEmail(request("MailboxOwner123")),
      verifyEmail(request("MailboxOwner123")),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 400,
    ]);
    const [owner] =
      await sql`SELECT hashed_password, email_verified, session_version FROM app.login WHERE user_id = ${userId}::uuid`;
    expect(owner).toMatchObject({ email_verified: true, session_version: 1 });
    expect(await bcrypt.compare("MailboxOwner123", owner.hashed_password)).toBe(
      true,
    );
    expect(
      await bcrypt.compare("attacker-password", owner.hashed_password),
    ).toBe(false);
  });
  it("invalidates pending approvals and sessions when resetting a password, and consumes recovery once", async () => {
    const proposal = await proposeToolAction(
      userId,
      sessionId,
      "completeTimeBlock",
      { blockId },
    );
    await sql`UPDATE app.login SET reset_token = ${hashToken("synthetic-recovery")}, reset_token_expires = NOW() + INTERVAL '1 hour' WHERE user_id = ${userId}::uuid`;
    const request = () =>
      new NextRequest("https://example.test/api/auth/password-reset/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "synthetic-recovery",
          password: "NewPassword123",
        }),
      });
    const resets = await Promise.all([
      resetPassword(request()),
      resetPassword(request()),
    ]);
    expect(resets.map((result) => result.status).sort()).toEqual([200, 400]);
    const [user] =
      await sql`SELECT session_version FROM app.login WHERE user_id = ${userId}::uuid`;
    expect(user.session_version).toBe(1);
    expect(
      (
        await approve(approvalRequest(), {
          params: Promise.resolve({ id: proposal.actionId }),
        })
      ).status,
    ).toBe(409);
  });
  it("revokes the calendar capability on deactivation and rejects legacy tokens on inactive rows", async () => {
    const request = new NextRequest(
      "https://example.test/api/auth/delete-account",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "delete my account" }),
      },
    );
    expect((await deleteAccount(request)).status).toBe(200);
    const [account] =
      await sql`SELECT calendar_export_token, session_version FROM app.login WHERE user_id = ${userId}::uuid`;
    expect(account).toMatchObject({
      calendar_export_token: null,
      session_version: 1,
    });
    await sql`UPDATE app.login SET calendar_export_token = ${calendarToken}::uuid WHERE user_id = ${userId}::uuid`;
    const result = await calendar(
      new NextRequest("https://example.test/api/calendar/ical/token"),
      { params: Promise.resolve({ token: calendarToken }) },
    );
    expect(result.status).toBe(404);
  });
});
