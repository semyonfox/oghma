// register page
'use client'
import { useState, useRef } from 'react';
import { useRouter } from "next/navigation";

const REGISTER_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/register`;

export default function Register() {
    const [email, setEmail] = useState('');
    const [pwd, setPwd] = useState('');
    const [errMsg, setErrMsg] = useState('');
    const errRef = useRef();
    const router = useRouter();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrMsg('');
        try {
            const response = await fetch(REGISTER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, password: pwd }),
                credentials: 'include',
            });
            if (!response.ok) {
                console.log('Registration failed with status:', response.status);
                try {
                    const errorData = await response.json();
                    setErrMsg(errorData.error || 'Registration Failed');
                    console.log('Server error message:', errorData.error);
                } catch (parseErr) {
                    // If response isn't JSON, use generic message
                    setErrMsg('Registration Failed');
                    console.error('Error parsing error response:', parseErr);
                }
                setPwd(''); // Clear password on error for security
                errRef.current && errRef.current.focus();
                return;
            }
            const data = await response.json();
            console.log('Registration successful:', JSON.stringify(data));
            setEmail('');
            setPwd('');
            router.push('/login');
        } catch (err) {
            console.error('Registration error - no server response:', err);
            setErrMsg('No Server Response');
            setPwd(''); // Clear password on error for security
            errRef.current && errRef.current.focus();
        }
    };
    return (
        <div>
            <h2>Register Page</h2>
            <p id="error-msg" ref={errRef} role="alert" aria-live="assertive" style={{color: 'red', display: errMsg ? 'block' : 'none'}}>{errMsg}</p>
            <form onSubmit={handleSubmit}>
                <label htmlFor="email">Email:</label>
                <input
                    type="email"
                    id="email"
                    name="email"
                    placeholder="Email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    aria-describedby="error-msg"
                />
                <label htmlFor="password">Password:</label>
                <input
                    type="password"
                    id="password"
                    name="password"
                    placeholder="Password"
                    required
                    value={pwd}
                    onChange={e => setPwd(e.target.value)} />
                <button type="submit">Register</button>
            </form>
        </div>
    );
}
