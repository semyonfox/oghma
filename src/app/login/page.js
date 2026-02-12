/*
* This login was adapted from Dave Gray's "React User login and Authentication with Axios", and altered using nextJS*/

'use client'
import {useRef, useState, useEffect} from 'react';
//import AuthContext from '@/context/AuthProvider';
import Link from "next/link";
import { login, getErrorMessage } from '@/lib/apiClient';

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
            const data = await login(user, pwd);
            console.log('login successful:', JSON.stringify(data));
            // Clear form and set success state
            setUser(''); //refreshing the login
            setPwd('');
            setSuccess(true); //letting the person into the web app
            // Note: enable when AuthContext is implemented
            // setAuth({ user, pwd, roles: data?.roles, accessToken: data?.accessToken });

        } catch (err) { //error cases for the login
            console.error('login error:', err);
            setErrMsg(getErrorMessage(err));
            setPwd(''); // Clear password on error for security
            errRef.current.focus();
        }
    }
    return (
        <div className="min-vh-100 d-flex align-items-center justify-content-center bg-dark">
            <div className="container">
                <div className="row justify-content-center">
                    <div className="col-md-5 col-lg-4">
                        {success ? (
                            <div className="card bg-dark border-success shadow-lg">
                                <div className="card-body text-center p-5">
                                    <h2 className="text-success fw-bold mb-3">Login Successful!</h2>
                                    <p className="text-light-emphasis mb-4">You are now logged in.</p>
                                    <Link href="/" className="btn btn-success btn-lg">
                                        Go to Home
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            <div className="card bg-dark border-secondary shadow-lg">
                                <div className="card-body p-4">
                                    <h1 className="text-center text-light mb-4 fs-3 fw-bold">
                                        Login to SocsBoard
                                    </h1>

                                    {errMsg && (
                                        <div id="error-msg" ref={errRef} role="alert" aria-live="assertive" className="alert alert-danger mb-3">
                                            <strong>Error:</strong> {errMsg}
                                        </div>
                                    )}

                                    <form onSubmit={handleSubmit}>
                                        <div className="mb-3">
                                            <label htmlFor="email" className="form-label text-light">Email</label>
                                            <input
                                                type="email"
                                                id="email"
                                                ref={userRef}
                                                autoComplete="off"
                                                onChange={(e) => setUser(e.target.value)}
                                                value={user}
                                                required
                                                aria-describedby="error-msg"
                                                className="form-control form-control-lg bg-dark text-light border-secondary"
                                                placeholder="Enter your email"
                                            />
                                        </div>

                                        <div className="mb-4">
                                            <label htmlFor="password" className="form-label text-light">Password</label>
                                            <input
                                                type="password"
                                                id="password"
                                                onChange={(e) => setPwd(e.target.value)}
                                                value={pwd}
                                                required
                                                aria-describedby="error-msg"
                                                className="form-control form-control-lg bg-dark text-light border-secondary"
                                                placeholder="Enter your password"
                                            />
                                        </div>

                                        <button type="submit" className="btn btn-primary btn-lg w-100 mb-3">
                                            Login
                                        </button>
                                    </form>

                                    <hr className="border-secondary" />

                                    <p className="text-center text-light mb-0">
                                        Need an account?{' '}
                                        <Link href="/register" className="text-primary text-decoration-none fw-bold">
                                            Register
                                        </Link>
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Page;