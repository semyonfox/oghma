/*
* This tells postgres how to connect to the database
* This code isn't
* */
import postgres from 'postgres';

// Check if DATABASE_URL is set, throw helpful error if not
if (!process.env.DATABASE_URL) {
    throw new Error(
        'DATABASE_URL environment variable is not set. ' +
        'Please configure your database connection string in your .env.local file.'
    );
}

const sql = postgres(process.env.DATABASE_URL);

export default sql;