import { ApiError, requireAuth } from "@/lib/api-error";

function configuredAdminEmails(): Set<string> {
  return new Set(
    (process.env.ANALYTICS_ADMIN_EMAILS || "")
      .split(",")
      .map((email: string) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAnalyticsAdmin(email: string | null | undefined): boolean {
  return Boolean(email && configuredAdminEmails().has(email.toLowerCase()));
}

export async function requireAnalyticsAdmin() {
  const user = await requireAuth();
  if (!isAnalyticsAdmin(user.email)) throw new ApiError(403, "Forbidden");
  return user;
}
