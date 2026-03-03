require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function main() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connection successful');

        const res = await client.query('SELECT version()');
        console.log('PostgreSQL version:', res.rows[0].version);

        // Test if users table exists
        const tables = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log('Tables:', tables.rows);

    } catch (error) {
        console.error('Database error:', error);
        throw error;
    } finally {
        await client.end();
    }
}

main().catch(console.error);