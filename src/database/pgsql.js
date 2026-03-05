import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';
const requiresSSL = DATABASE_URL.includes('sslmode=require');

const sql = postgres(DATABASE_URL, {
    ssl: requiresSSL ? { rejectUnauthorized: false } : false,
});

export default sql;