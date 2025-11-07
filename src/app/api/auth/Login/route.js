/*
* This is for:
* validate fields are present
* connecting to tailscale postgreSQL
* query server to find username/password
* generate JWT token/create session
* return success respones
* handle errors (user not found/wrong password/database errors
*
* NOTES: it looks like the userID isnt auto incrementing but shrey has the correct command so i need to check my addresses
* and how i've defined everything again
* */

// taken from authentication beta docs, nextJS on the 07/11/2025: https://nextjs.org/docs/app/guides/authentication
import bcrypt from "bcrypt";
import db from "@/lib/db";
import sql from "@/lib/db";
async function signup(state, formData) {
    // 1. Validate form fields
    // based loosely off geeksforgeeks validation tutorial, accessed 07/11/25: https://www.geeksforgeeks.org/javascript/form-validation-using-javascript/
    const username = document.getElementById("username").value;
    const userPwd = document.getElementById("password").value;

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

    if (isValid) {
        // 2. Prepare data for insertion into database
        const validatedFields = {username, password: userPwd};
        const { username: name, password } = validatedFields;
        // e.g. Hash the user's password before storing it
        const hashedPassword = await bcrypt.hash(password, 10);

        // 3. Insert the user into the database or call a Library API
        const data = await sql`
            INSERT INTO login ("userName", password) 
            VALUES (${name}, ${hashedPassword}) 
            RETURNING "userID"`;

        const user = data[0]

        if (!user) {
            return {
                message: 'An error occurred while creating your account.',
            }
        }

        // TODO:
        // 4. Create user session
        // 5. Redirect user
    }

    function serverQuery(req, res, next) {}

    function errorHandler(err, req, res, next) {}
}

export default signup
