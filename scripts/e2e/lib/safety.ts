// guards for scripts that wipe or seed services. shell env wins over the
// .env.e2e/.env.mock files, so a stray export must not point a reset at a
// shared database, Redis or Qdrant

const allowNonLocalEnv = "E2E_ALLOW_NONLOCAL_DB_RESET";

type Env = Readonly<Record<string, string | undefined>>;

export function isLocalServiceHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    // URL keeps the brackets on IPv6 hostnames
    hostname === "[::1]" ||
    hostname === "::1" ||
    // docker compose service name for the disposable stack
    hostname === "postgres" ||
    hostname.endsWith(".local")
  );
}

function nonLocalAllowed(env: Env): boolean {
  return env[allowNonLocalEnv] === "1";
}

export function assertDisposableDatabaseUrl(
  databaseUrl: string | undefined,
  env: Env = process.env,
): asserts databaseUrl is string {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or E2E_DATABASE_URL is required");
  }

  const parsed = new URL(databaseUrl);
  const dbName = parsed.pathname.replace(/^\//, "");
  if (!dbName.includes("e2e")) {
    throw new Error(
      `Refusing to touch database '${dbName}'. Disposable database names must include 'e2e'.`,
    );
  }

  if (!isLocalServiceHost(parsed.hostname) && !nonLocalAllowed(env)) {
    throw new Error(
      `Refusing to touch non-local database host '${parsed.hostname}'. Set ${allowNonLocalEnv}=1 only for disposable CI services.`,
    );
  }
}

/** Redis and Qdrant have no name to check, so only their host can mark them disposable. */
export function assertDisposableServiceHost(
  service: string,
  hostname: string,
  env: Env = process.env,
): void {
  if (!isLocalServiceHost(hostname) && !nonLocalAllowed(env)) {
    throw new Error(
      `Refusing to reset non-local ${service} host '${hostname}'. Set ${allowNonLocalEnv}=1 only for disposable CI services.`,
    );
  }
}
