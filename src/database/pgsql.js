import postgres from 'postgres';

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
        sql = postgres(url, {
            ssl: requiresSSL ? { rejectUnauthorized: false } : false,
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