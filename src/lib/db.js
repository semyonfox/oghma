/*
* This tells postgres how to connect to the database
* This code isn't
* */
import postgres from 'postgres';

const sql = postgres({
    host: '100.118.61.122',
    port: 5432,
    database: 'ct2103',
    username: 'sam@s.s',
    password: '234567',
});

export default sql;