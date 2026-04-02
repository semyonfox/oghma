import { NextResponse } from "next/server";
import sql from "@/database/pgsql";

export const GET = async () => {
    const [row] = await sql`SELECT current_database(), inet_server_addr(), current_user`;
    return NextResponse.json(row);
};