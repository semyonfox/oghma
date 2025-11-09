// Register page
'use client'
import axios from 'axios';

const REGISTER_URL = "/api/register";

export default function Register() {
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.post(REGISTER_URL,
                JSON.stringify({username, password}),
                {
                    headers: {'Content-Type': 'application/json'},
                    withCredentials: true
                }
            );
            console.log(JSON.stringify(response?.data));
            const accessToken = response?.data?.accessToken; //optional chaining
            const roles = response?.data?.roles;
            setUser(''); //refreshing the register
            setPwd('');
            alert('Registered successfully');
            window.location.href = '/login';

        } catch (err) { //error cases for the register
            if (!err?.response) {
                setErrMsg('No Server Response');
            } else if (err.response?.status === 400) {
                setErrMsg('Missing Username or Password');
            } else if (err.response?.status === 401) {
                setErrMsg('Unauthorized');
            } else if (err.response?.status === 409) {
                alert('Username Already Exists');
            } else {
                    setErrMsg('Registration Failed');
                }
            }
            errRef.current.focus();
        }
    return (
        <div>
            <h2>Register Page</h2>
            <form onSubmit={handleSubmit}>
                <input type="text" name="username" placeholder="Username" required/>
                <input type="password" name="password" placeholder="Password" required/>
                <button type="submit">Register</button>
            </form>
        </div>
    )
}
