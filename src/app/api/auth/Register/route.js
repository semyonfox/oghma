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
    //error handling sourced from nextjs beta docs, accessed 09/11/2025: https://nextjs.org/docs/app/api-reference/file-conventions/route#error-handling
    // 1. Validate form fields
    // based loosely off geeksforgeeks validation tutorial, accessed 07/11/25: https://www.geeksforgeeks.org/javascript/form-validation-using-javascript/
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

    //6. error handling
    try {
        validateFields();
        if (isValid) {
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

            // 4. Create user session (generating/returning JWT)
            // sourced from jsonwebtoken library documentation: https://github.com/auth0/node-jsonwebtoken#usage (accessed 09/11/25)
            const token = jwt.sign({userID: user.userID, username: name},
                process.env.JWT_SECRET,
                {expiresIn: '7d'}
            );

            const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); //expires in a week from when it was made

            cookies().set('session', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                expires: expires,
                sameSite: 'lax',
                path: '/' //this just means the cookie can be accessed on all routes
            });

            // 5. Redirect user
            redirect('/'); //sends them to the home page
        } else if (!isValid) {
            return NextResponse.json({error: 'missing fields'});
        }
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({error: 'internal server error'});
    }
}
