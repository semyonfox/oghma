/*
* This route is for:
* receives username/password from request body (data sent from font to backend in the HTTP request
* validate email/password strength/ required fields
* connects to postgres database
* checks if password/user exists
* hash password (bcrypt)
* insert new user record into db
* generate JWT token/create session
* return success response and user data
* handle errors (validation failures/db errors/duplicate user/etc.)
*/

// taken from authentication beta docs, nextJS on the 07/11/2025: https://nextjs.org/docs/app/guides/authentication
import bcrypt from "bcrypt";
import sql from "@/lib/db";
import jwt from 'jsonwebtoken';
import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import {redirect} from "next/navigation";


export async function POST(request) {
    const body = await request.json();
    const username = body.username;
    const userPwd = body.password;

    let isValid = true;
    function validateFields() {

        if (username == null || username == "") {
            isValid = false;
        }
        if (userPwd == null || userPwd == "") {
            isValid = false;
        }
        return isValid;
    }

    // 2. Prepare data for insertion into database
    const validatedFields = {username, password: userPwd};
    const {username: name, password} = validatedFields;
    // e.g. Hash the user's password before storing it
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Insert the user into the database or call a Library API
    const data = await sql`
        INSERT INTO login ("userName", password)
        VALUES (${name}, ${hashedPassword})
        RETURNING "userID"`;

    const user = data[0] //this contains the returned row from INSERT - used for jwt payload

    if (!user) {
        return NextResponse.json({error: 'An error occurred while creating your account.'});
    }
}

/*
    function hash(req, res, next) {
        const hashedPassword = await bcrypt.hash(pwd, 13);

        const result = await sql("SELECT * FROM users WHERE user_id = ${user}");
        if (result.rows.length > 0) {
            const match = await bcrypt.compare(pwd, result.rows[0].password);
            if (match) {

            }
        }

    }

 */

    function JWTCall(req, res, next) {
    }
}

