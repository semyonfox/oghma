import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import sql from "@/database/pgsql.js";
import { validateSession } from "@/lib/auth.js";
import logger from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { currentPassword?: string; newPassword?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current password and new password are required" },
        { status: 400 },
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters" },
        { status: 400 },
      );
    }

    // fetch the stored hash for this user
    const [row] = await sql`
      SELECT hashed_password FROM app.login WHERE user_id = ${user.user_id}::uuid
    `;

    if (!row?.hashed_password) {
      // OAuth-only accounts have no password — cannot change via this endpoint
      return NextResponse.json(
        {
          error:
            "No password is set for this account. Use your OAuth provider to manage authentication.",
        },
        { status: 400 },
      );
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      row.hashed_password,
    );
    if (!passwordMatches) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 },
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await sql`
      UPDATE app.login
      SET hashed_password = ${hashedPassword}
      WHERE user_id = ${user.user_id}::uuid
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("change password error", { error });
    return NextResponse.json(
      { error: "Failed to change password" },
      { status: 500 },
    );
  }
}
