// centralized runtime configuration
// values can be overridden via environment variables

function intEnv(key: string, fallback: number): number {
    const v = process.env[key];
    if (!v) return fallback;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? fallback : n;
}

function positiveIntEnv(key: string, fallback: number): number {
    const raw = process.env[key];
    if (raw === undefined) return fallback;
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
        fileTimeoutMs: intEnv('CANVAS_FILE_TIMEOUT_MS', 120000),
        pollIntervalMs: intEnv('CANVAS_POLL_INTERVAL_MS', 3000),
    },
    upload: {
        maxFileSizeBytes: intEnv('UPLOAD_MAX_FILE_SIZE', 50 * 1024 * 1024),
    },
} as const;
