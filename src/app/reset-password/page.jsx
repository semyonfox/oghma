'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import useI18n from '@/lib/notes/hooks/use-i18n';

function ResetPasswordForm() {
    const { t } = useI18n();
    const searchParams = useSearchParams();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Get token from URL (no effect needed - just read on render)
    const token = searchParams.get('token') || '';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');

        if (password !== confirmPassword) {
            setError(t('Passwords do not match'));
            return;
        }

        setLoading(true);

        try {
            const res = await fetch('/api/auth/password-reset/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });

            const data = await res.json();

            if (res.ok) {
                setMessage(t('Password reset successful! Redirecting to login...'));
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            } else {
                setError(data.error || data.errors?.join(', ') || t('Failed to reset password'));
            }
        } catch (err) {
            setError(t('An error occurred. Please try again.'));
        }

        setLoading(false);
    };

    if (!token) {
        return (
            <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px' }}>
                <h1>{t('Invalid Reset Link')}</h1>
                <p>{t('The password reset link is invalid or missing.')}</p>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px' }}>
            <h1>{t('Reset Password')}</h1>
            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '15px' }}>
                    <label htmlFor="password" style={{ display: 'block', marginBottom: '5px' }}>
                        {t('New Password')}
                    </label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t('Enter new password')}
                        required
                        style={{ width: '100%', padding: '10px', fontSize: '16px' }}
                    />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label htmlFor="confirmPassword" style={{ display: 'block', marginBottom: '5px' }}>
                        {t('Confirm Password')}
                    </label>
                    <input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t('Confirm new password')}
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
                    {loading ? t('Resetting...') : t('Reset Password')}
                </button>
            </form>

            {message && (
                <p style={{ marginTop: '20px', padding: '10px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '5px' }}>
                    {message}
                </p>
            )}
            {error && (
                <p style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '5px' }}>
                    {error}
                </p>
            )}
        </div>
    );
}

export default function ResetPasswordPage() {
    const { t } = useI18n();
    return (
        <Suspense fallback={<div>{t('Loading...')}</div>}>
            <ResetPasswordForm />
        </Suspense>
    );
}