/*
* middleware.js handles CORS globally and is a cleaner/more maintainable than a server.js.
* allows you to run code before a request is completed, then you can modify the response
* by rewriting/redirecting/modifying the request/response headers.
* uses:
*   matchers - filters middleware to run on specific paths
*   NextResponse - lets you redirect/rewrite the request/response to another URL and set response headers/cookies
*
* Goal:
* read and validate JWT token
* CORS headers
*
* NOTE: this is optional - a good analogy is that if the auth directory is the
* bartender at massimo's, middleware.js is the bouncer that checks your ID


const app = express();
const cors = require("cors");
const users = []

function validateJWT(req, res, next) {}

function weHateCORS(req,res){
    //login endpoint; rewrite into the api's directory
    app.post('/auth.login', (req, res) => {
        const {user, pwd } = req.body;
        console.log("login attempt by ", user, pwd);

        res.json({
            message: 'Login recieved',
            accessToken: 'test-token',
            roles: ['admin']
        });
    });
//rewrite for nextjs
    app.get('/users', (req,res) => {
        res.json(users)
    });
}
*/