/*
* This login was adapted from Dave Gray's "React User login and Authentication with Axios", and altered using nextJS*/

'use client'
import {useRef, useState, useEffect, useContext} from 'react';
//import AuthContext from '@/context/AuthProvider';
// import sql from "@/lib/db.js";
import Link from "next/link";

const LOGIN_URL = "http://localhost:3000/api/auth/login";

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
                body: JSON.stringify({user, pwd}),
                credentials: 'include',
            });
            if (!response.ok) {
                if (response.status === 400) {
                    setErrMsg('Missing Username or Password');
                } else if (response.status === 401) {
                    setErrMsg('Unauthorized');
                } else {
                    setErrMsg('Login Failed');
                }
                errRef.current.focus();
                return;
            }
            const data = await response.json();
            console.log(JSON.stringify(data));
            const accessToken = data?.accessToken; //optional chaining
            const roles = data?.roles;
            setUser(''); //refreshing the login
            setPwd('');
            setSuccess(true); //letting the person into the web app
            setAuth && setAuth({ user, pwd, roles, accessToken });

        } catch (err) { //error cases for the login
            setErrMsg('No Server Response');
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
            <p ref={errRef} className={errMsg ? "errMsg" : "offscreen"} aria-live="assertive">{errMsg}</p>
            <h1>Log in</h1>
            <form onSubmit={handleSubmit}>
                <label htmlFor="username">Username:</label>
                <input type="text"
                   id ="username"
                   ref={userRef}
                   autoComplete="off"
                   onChange={(e) => setUser(e.target.value)}
                   value={user}
                   required
                />

                <label htmlFor="password">Password:</label>
                <input
                    type="password"
                    id="password"
                    onChange={(e) => setPwd(e.target.value)}
                    value={pwd}
                    required
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