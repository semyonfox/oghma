/*
* This tells postgres how to connect to the database
* This code isn't
* */
import postgres from 'postgres';

const sql = postgres({
    host: process.env.DATABASE_HOST,
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
});

export default sql;