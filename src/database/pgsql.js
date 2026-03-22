import postgres from 'postgres';
import { ca as rdsCaCerts } from 'aws-ssl-profiles';

// lazy connection - only created on first use, not at module load
// this ensures runtime env vars are available (not build-time values)
let sql;

function getSQL() {
    if (!sql) {
        const url = process.env.DATABASE_URL;
        if (!url) {
            throw new Error(
                'DATABASE_URL is not set. Available env keys: ' +
                Object.keys(process.env).filter(k => k.startsWith('DATA') || k.startsWith('JWT') || k.startsWith('STOR')).join(', ')
            );
        }
        const requiresSSL = url.includes('sslmode=require');
        // use the bundled AWS RDS CA certificates for proper TLS verification
        sql = postgres(url, {
            ssl: requiresSSL ? { ca: rdsCaCerts } : false,
            // Connection timeout settings (in milliseconds)
            idle_in_transaction_session_timeout: 30000, // 30s - max time for transaction
            statement_timeout: 30000, // 30s - max time for a single query
            // Connection pool settings
            max: 20, // max 20 connections in pool
            idle_timeout: 10, // close idle connections after 10s
            connect_timeout: 10, // 10s to establish connection
        });
    }
    return sql;
}

// proxy that lazily initializes the postgres connection
// must be a function target so tagged template calls (sql`...`) work via apply trap
export default new Proxy(function(){}, {
    get(_, prop) {
        const instance = getSQL();
        const value = instance[prop];
        if (typeof value === 'function') {
            return value.bind(instance);
        }
        return value;
    },
    apply(_, __, args) {
        return getSQL()(...args);
    },
});