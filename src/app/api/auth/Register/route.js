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

function validateUser(req, res, next) {}

function serverQuery(req, res, next) {}

function hash(req, res, next) {
    const hashedPassword = await bcrypt.hash(pwd,13);

    const result = await sql("SELECT * FROM users WHERE user_id = ${user}");
    if (result.rows.length > 0) {
        const match = await bcrypt.compare(pwd, result.rows[0].password);
        if (match) {

        }
    }

}

function JWTCall(req, res, next) {}

