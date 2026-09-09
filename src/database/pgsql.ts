import postgres from "postgres";
import { config } from "@/lib/config";

type PostgresClient = ReturnType<typeof postgres>;

/**
 * Application-facing subset of postgres.js. Query results are exposed as the
 * awaited row array callers consume; transaction callbacks retain the native
 * postgres.js contract.
 */
export interface DatabaseSql {
    <T extends Record<string, unknown>>(
        value: T,
        ...columns: string[]
    ): postgres.Helper<T>;
    <T extends readonly (object | undefined)[] = postgres.Row[]>(
        template: TemplateStringsArray,
        ...parameters: readonly unknown[]
    ): Promise<T>;
    begin: PostgresClient["begin"];
    json: PostgresClient["json"];
    end: PostgresClient["end"];
}

// lazy connection - only created on first use, not at module load
// This makes runtime environment variables available instead of build-time values.
let sql: PostgresClient | undefined;

function getSQL(): PostgresClient {
    if (!sql) {
        const url = process.env.DATABASE_URL;
        if (!url) {
            throw new Error(
                "DATABASE_URL is not set. Available env keys: " +
                Object.keys(process.env)
                    .filter((key) =>
                        key.startsWith("DATA") ||
                        key.startsWith("JWT") ||
                        key.startsWith("STOR"),
                    )
                    .join(", "),
            );
        }
        const requiresSSL = url.includes("sslmode=require");
        const options: postgres.Options<Record<string, postgres.PostgresType>> = {
            ssl: requiresSSL ? { rejectUnauthorized: false } : false,
            connection: {
                application_name: process.env.DB_APPLICATION_NAME || (process.argv.some(arg => arg.endsWith("/worker-entry.ts")) ? "oghmanotes-worker" : "oghmanotes-app"),
                idle_in_transaction_session_timeout: config.db.transactionTimeoutMs,
                statement_timeout: config.db.statementTimeoutMs,
            },
            max: config.db.maxConnections,
            idle_timeout: config.db.idleTimeoutSeconds,
            connect_timeout: config.db.connectTimeoutSeconds,
        };
        sql = postgres(url, options);
    }
    return sql;
}

// proxy that lazily initializes the postgres connection
// must be a function target so tagged template calls (sql`...`) work via apply trap
// The proxy target is only a callable shell; every operation is forwarded to
// the lazily-created Sql client. The factory target deliberately lacks client
// properties, so this one expected structural mismatch is confined here.
// @ts-expect-error Runtime get/apply traps provide the declared DatabaseSql surface.
const lazySql: DatabaseSql = new Proxy(postgres, {
    get(_target, prop) {
        const instance = getSQL();
        const value: unknown = Reflect.get(instance, prop);
        if (typeof value === "function") {
            return value.bind(instance);
        }
        return value;
    },
    apply(_target, _thisArg, args) {
        return Reflect.apply(getSQL(), undefined, args);
    },
});

export default lazySql;
