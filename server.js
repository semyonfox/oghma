const express = require ('express');
const app = express();

const cors = require("cors");

app.use(cors({
    origin: "http://localhost:3000",
    credentials: true
}));

app.use(express.json());

const users = []

//login endpoint
app.post('/auth.login', (req, res) => {
    const {user, pwd } = req.body;
    console.log("login attempt by ", user, pwd);

    res.json({
        message: 'Login recieved',
        accessToken: 'test-token',
        roles: ['admin']
    });
});

app.get('/users', (req,res) => {
    res.json(users)
});

app.listen(5000, () => {
    console.log('server running on port 5000');
});