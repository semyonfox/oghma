function configuredAdminEmails(
  value = process.env.ANALYTICS_ADMIN_EMAILS,
): Set<string> {
  return new Set(
    (value || "")
      .split(",")
      .map((email: string) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAnalyticsAdmin(
  email: string | null | undefined,
  value = process.env.ANALYTICS_ADMIN_EMAILS,
): boolean {
  return Boolean(email && configuredAdminEmails(value).has(email.toLowerCase()));
}

export async function requireAnalyticsAdmin() {
  const { ApiError, requireAuth } = await import("@/lib/api-error");
  const user = await requireAuth();
  if (!isAnalyticsAdmin(user.email)) throw new ApiError(403, "Forbidden");
  return user;
}
