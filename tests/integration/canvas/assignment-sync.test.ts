import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import sql from "@/database/pgsql";
import { syncAssignmentMetadata } from "@/lib/canvas/sync-assignments";
import type { CanvasAssignment } from "@/lib/canvas/client";

const users: string[] = [];

async function user() {
  const id = randomUUID();
  users.push(id);
  await sql`INSERT INTO app.login (user_id, email, hashed_password)
    VALUES (${id}::uuid, ${`${id}@example.test`}, 'not-a-password')`;
  return id;
}

function client(assignments: CanvasAssignment[]) {
  return { getAssignments: async () => ({ data: assignments, forbidden: false }) };
}

async function statusOf(userId: string, canvasAssignmentId: string) {
  const [row] = await sql<{ status: string }[]>`
    SELECT status FROM app.assignments
    WHERE user_id = ${userId}::uuid AND canvas_assignment_id = ${canvasAssignmentId}::bigint
  `;
  return row?.status ?? null;
}

describe("Canvas assignment sync with PostgreSQL", () => {
  beforeEach(() => {
    if (!process.env.DATABASE_URL?.includes("e2e")) throw new Error("Disposable e2e database required");
  });

  afterAll(async () => {
    await sql`DELETE FROM app.assignments WHERE user_id = ANY(${users}::uuid[])`;
    await sql`DELETE FROM app.login WHERE user_id = ANY(${users}::uuid[])`;
    await sql.end();
  });

  it("keeps tracker progress the user set and upserts without duplicates", async () => {
    const userId = await user();
    const overdue = { id: "9007199254740993", name: "Lab", due_at: "2020-01-01T00:00:00Z" };
    await syncAssignmentMetadata("42", userId, "Course", client([overdue]));
    expect(await statusOf(userId, overdue.id)).toBe("late");

    await sql`UPDATE app.assignments SET status = 'done'
      WHERE user_id = ${userId}::uuid AND canvas_assignment_id = ${overdue.id}::bigint`;
    await syncAssignmentMetadata("42", userId, "Course", client([overdue]));
    expect(await statusOf(userId, overdue.id)).toBe("done");

    const [{ count }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM app.assignments WHERE user_id = ${userId}::uuid
    `;
    expect(count).toBe(1);
  });

  it("removes assignments deleted in Canvas but keeps other courses and manual tasks", async () => {
    const userId = await user();
    const kept = { id: "1", name: "Kept", due_at: "2030-01-01T00:00:00Z" };
    const deleted = { id: "2", name: "Deleted", due_at: "2030-01-01T00:00:00Z" };
    const otherCourse = { id: "3", name: "Other course", due_at: "2030-01-01T00:00:00Z" };
    await syncAssignmentMetadata("42", userId, "Course", client([kept, deleted]));
    await syncAssignmentMetadata("43", userId, "Other", client([otherCourse]));
    await sql`INSERT INTO app.assignments (user_id, title, source, assignment_type)
      VALUES (${userId}::uuid, 'Manual', 'manual', 'manual')`;

    const result = await syncAssignmentMetadata("42", userId, "Course", client([kept]));

    expect(result.removed).toBe(1);
    const rows = await sql<{ title: string }[]>`
      SELECT title FROM app.assignments WHERE user_id = ${userId}::uuid ORDER BY title
    `;
    expect(rows.map((row) => row.title)).toEqual(["Kept", "Manual", "Other course"]);
  });
});
