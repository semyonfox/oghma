export function sanitizePostgresText(value: string): string {
  // PostgreSQL text cannot store NUL bytes even though JavaScript strings can.
  return value.replace(/\u0000/g, "");
}
