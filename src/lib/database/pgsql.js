/*
* This tells postgres how to connect to the database
* Lazily validates DATABASE_URL to allow builds without a database connection
* */
import postgres from 'postgres';

// Use a stub URL during build, real URL at runtime
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';

// Only validate in production/runtime (not during build)
let sql;
if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
    // Will throw at runtime if accessed without proper config
    sql = new Proxy({}, {
        get() {
            throw new Error(
                'DATABASE_URL environment variable is not set. ' +
                'Please configure your database connection string in your .env file.'
            );
        }
    });
} else {
    sql = postgres(DATABASE_URL);
}

export default sql;