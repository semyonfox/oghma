// centralized runtime configuration
// values can be overridden via environment variables

// an empty value (KEY= in an env file) means unset. anything else must be a
// positive integer: a silent fallback hid typos like "100MB" parsing as 100
function positiveIntEnv(key: string, fallback: number): number {
    const raw = process.env[key]?.trim();
    if (!raw) return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${key} must be a positive integer`);
    }
    return value;
}

export const config = {
    db: {
        maxConnections: positiveIntEnv('DB_MAX_CONNECTIONS', 20),
        idleTimeoutSeconds: positiveIntEnv('DB_IDLE_TIMEOUT', 10),
        connectTimeoutSeconds: positiveIntEnv('DB_CONNECT_TIMEOUT', 10),
        statementTimeoutMs: positiveIntEnv('DB_STATEMENT_TIMEOUT', 30000),
        transactionTimeoutMs: positiveIntEnv('DB_TRANSACTION_TIMEOUT', 30000),
    },
    canvas: {
        pollIntervalMs: positiveIntEnv('CANVAS_POLL_INTERVAL_MS', 3000),
    },
    upload: {
        maxFileSizeBytes: positiveIntEnv('UPLOAD_MAX_FILE_SIZE', 50 * 1024 * 1024),
    },
} as const;
