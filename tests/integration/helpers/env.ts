export function requireE2EDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL || process.env.E2E_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or E2E_DATABASE_URL is required");
  }

  const dbName = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (!dbName.includes("e2e")) {
    throw new Error(`Refusing to run integration tests against non-E2E DB '${dbName}'`);
  }

  return databaseUrl;
}

