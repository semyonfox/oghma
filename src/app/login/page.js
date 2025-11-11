/*
* This login was adapted from Dave Gray's "React User login and Authentication with Axios", and altered using nextJS*/

'use client'
import {useRef, useState, useEffect, useContext} from 'react';
//import AuthContext from '@/context/AuthProvider';
// import sql from "@/lib/pgsql.js";
import Link from "next/link";

const LOGIN_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/login`;

const Page = () => {
    // const {setAuth} = useContext(AuthContext);
    const userRef = useRef(null);
    const errRef = useRef(null);

    const[user, setUser] = useState(''); /*four states of the page*/
    const[pwd, setPwd] = useState('');
    const[errMsg, setErrMsg] = useState('');
    const[success, setSuccess] = useState(false);

    useEffect(() => {
        userRef.current.focus();
    }, [])

    useEffect(() => {
        setErrMsg('');
    }, [user, pwd]) /*clear out any errors for next attempt*/

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(LOGIN_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({email: user, password: pwd}),
                credentials: 'include',
            });
            if (!response.ok) {
                // more inclusive error handling
                console.log('Login failed with status:', response.status);
                try {
                    const errorData = await response.json();
                    setErrMsg(errorData.error || 'Login Failed');
                    console.log('Server error message:', errorData.error);
                } catch (parseErr) {
                    // If response isn't JSON, use generic message
                    setErrMsg('Login Failed');
                    console.error('Error parsing error response:', parseErr);
                }
                setPwd(''); // Clear password on error for security
                errRef.current.focus();
                return;
            }
            const data = await response.json();
            console.log('Login successful:', JSON.stringify(data));
            // Clear form and set success state
            setUser(''); //refreshing the login
            setPwd('');
            setSuccess(true); //letting the person into the web app
            // Note: enable when AuthContext is implemented
            // setAuth({ user, pwd, roles: data?.roles, accessToken: data?.accessToken });

        } catch (err) { //error cases for the login
            console.error('Login error - no server response:', err);
            setErrMsg('No Server Response');
            setPwd(''); // Clear password on error for security
            errRef.current.focus();
        }
    }
    return (
        <>
            {success ? (
                <section>
                    <h1>You are logged in!</h1>
                    <br />
                    <p>
                        <Link href="/">Go to Home</Link>
                    </p>
                </section>
            ) : (
        <section>
            <p id="error-msg" ref={errRef} role="alert" className={errMsg ? "errMsg" : "offscreen"} aria-live="assertive">{errMsg}</p>
            <h1>Log in</h1>
            <form onSubmit={handleSubmit}>
                <label htmlFor="email">Email:</label>
                <input type="email"
                   id ="email"
                   ref={userRef}
                   autoComplete="off"
                   onChange={(e) => setUser(e.target.value)}
                   value={user}
                   required
                   aria-describedby="error-msg"
                />

                <label htmlFor="password">Password:</label>
                <input
                    type="password"
                    id="password"
                    onChange={(e) => setPwd(e.target.value)}
                    value={pwd}
                    required
                    aria-describedby="error-msg"
                />
                <button>Log in</button>
            </form>
            <p>
                Need a Account?<br />
                <span className="line">
                    {/*router link*/}
                    <Link href="/register">Sign Up</Link>
                </span>
            </p>
        </section>
            )}
        </>
    )
}

export default Page;