// centralized runtime configuration
// values can be overridden via environment variables

function intEnv(key: string, fallback: number): number {
    const v = process.env[key];
    if (!v) return fallback;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? fallback : n;
}

export const config = {
    db: {
        maxConnections: intEnv('DB_MAX_CONNECTIONS', 20),
        idleTimeoutSeconds: intEnv('DB_IDLE_TIMEOUT', 10),
        connectTimeoutSeconds: intEnv('DB_CONNECT_TIMEOUT', 10),
        statementTimeoutMs: intEnv('DB_STATEMENT_TIMEOUT', 30000),
        transactionTimeoutMs: intEnv('DB_TRANSACTION_TIMEOUT', 30000),
    },
    canvas: {
        fileTimeoutMs: intEnv('CANVAS_FILE_TIMEOUT_MS', 120000),
        pollIntervalMs: intEnv('CANVAS_POLL_INTERVAL_MS', 3000),
    },
    upload: {
        maxFileSizeBytes: intEnv('UPLOAD_MAX_FILE_SIZE', 50 * 1024 * 1024),
    },
} as const;
