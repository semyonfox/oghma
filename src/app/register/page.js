// register page
'use client'
import { useState, useRef } from 'react';

const REGISTER_URL = "http://localhost:3000/api/auth/register";

export default function Register() {
    const [user, setUser] = useState('');
    const [pwd, setPwd] = useState('');
    const [errMsg, setErrMsg] = useState('');
    const errRef = useRef();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrMsg('');
        try {
            const response = await fetch(REGISTER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user, password: pwd }),
                credentials: 'include',
            });
            if (!response.ok) {
                if (response.status === 409) {
                    alert('Username Already Exists');
                    return;
                }
                if (response.status === 400) {
                    setErrMsg('Missing Username or Password');
                } else if (response.status === 401) {
                    setErrMsg('Unauthorized');
                } else {
                    setErrMsg('Registration Failed');
                }
                errRef.current && errRef.current.focus();
                return;
            }
            const data = await response.json();
            console.log(JSON.stringify(data));
            setUser('');
            setPwd('');
            alert('Registered successfully');
            window.location.href = '/login';
        } catch (err) {
            setErrMsg('No Server Response');
            errRef.current && errRef.current.focus();
        }
    };
    return (
        <div>
            <h2>Register Page</h2>
            {errMsg && <p ref={errRef} style={{color: 'red'}} tabIndex={-1}>{errMsg}</p>}
            <form onSubmit={handleSubmit}>
                <input type="text" name="username" placeholder="Username" required value={user} onChange={e => setUser(e.target.value)} />
                <input type="password" name="password" placeholder="Password" required value={pwd} onChange={e => setPwd(e.target.value)} />
                <button type="submit">Register</button>
            </form>
        </div>
    );
}
