'use client';
import { useState } from 'react';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        try {
            const res = await fetch('/api/auth/password-reset/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await res.json();
            setMessage(data.message);
        } catch (err) {
            setMessage('An error occurred. Please try again.');
        }

        setLoading(false);
    };

    return (
        <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px' }}>
            <h1>Forgot Password</h1>
            <p style={{ marginBottom: '20px', color: '#666' }}>
                Enter your email address and we'll send you a link to reset your password.
            </p>

            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '15px' }}>
                    <label htmlFor="email" style={{ display: 'block', marginBottom: '5px' }}>
                        Email Address
                    </label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email"
                        required
                        style={{ width: '100%', padding: '10px', fontSize: '16px' }}
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        width: '100%',
                        padding: '12px',
                        backgroundColor: loading ? '#ccc' : '#0070f3',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        fontSize: '16px',
                        cursor: loading ? 'not-allowed' : 'pointer'
                    }}
                >
                    {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
            </form>

            {message && (
                <p style={{ marginTop: '20px', padding: '10px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '5px' }}>
                    {message}
                </p>
            )}

            <p style={{ marginTop: '20px', textAlign: 'center' }}>
                <a href="/login" style={{ color: '#0070f3' }}>Back to Login</a>
            </p>
        </div>
    );
}