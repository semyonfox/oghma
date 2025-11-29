// register page
'use client'
import { useState, useRef } from 'react';
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register, getErrorMessage } from '@/lib/apiClient';

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
            const data = await register(email, pwd);
            console.log('Registration successful:', JSON.stringify(data));
            setEmail('');
            setPwd('');
            router.push('/login');
        } catch (err) {
            console.error('Registration error:', err);
            setErrMsg(getErrorMessage(err));
            setPwd(''); // Clear password on error for security
            errRef.current && errRef.current.focus();
        }
    };

    return (
        <div className="min-vh-100 d-flex align-items-center justify-content-center bg-dark">
            <div className="container">
                <div className="row justify-content-center">
                    <div className="col-md-5 col-lg-4">
                            <div className="card bg-dark border-secondary shadow-lg">
                            <div className="card-body p-4">
                                <h1 className="text-center text-light mb-4 fs-3 fw-bold">
                                    Create Account
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
                                            name="email"
                                            placeholder="Enter your email"
                                            required
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            aria-describedby="error-msg"
                                            className="form-control form-control-lg bg-dark text-light border-secondary"
                                        />
                                    </div>

                                    <div className="mb-4">
                                        <label htmlFor="password" className="form-label text-light">Password</label>
                                        <input
                                            type="password"
                                            id="password"
                                            name="password"
                                            placeholder="Create a password"
                                            required
                                            value={pwd}
                                            onChange={e => setPwd(e.target.value)}
                                            className="form-control form-control-lg bg-dark text-light border-secondary"
                                        />
                                    </div>

                                    <button type="submit" className="btn btn-primary btn-lg w-100 mb-3">
                                        Register
                                    </button>
                                </form>

                                <hr className="border-secondary" />

                                <p className="text-center text-light mb-0">
                                    Already have an account?{' '}
                                    <Link href="/login" className="text-primary text-decoration-none fw-bold">
                                        Login
                                    </Link>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
