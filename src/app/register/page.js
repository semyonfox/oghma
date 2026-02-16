'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { register, getErrorMessage } from '@/lib/apiClient';
import { AuthLayout } from '@/components/catalyst/auth-layout';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Checkbox, CheckboxField } from '@/components/catalyst/checkbox';
import { Field, Label } from '@/components/catalyst/fieldset';
import { Heading } from '@/components/catalyst/heading';
import { Text, TextLink, Strong } from '@/components/catalyst/text';
import { Alert, AlertTitle, AlertDescription } from '@/components/catalyst/alert';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const errRef = useRef();
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrMsg('');

    if (pwd !== confirmPwd) {
      setErrMsg('Passwords do not match');
      errRef.current?.focus();
      return;
    }

    if (pwd.length < 8) {
      setErrMsg('Password must be at least 8 characters');
      errRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      await register(email, pwd);
      setEmail('');
      setPwd('');
      setConfirmPwd('');
      setSuccess(true);
      setTimeout(() => router.push('/login'), 1500);
    } catch (err) {
      setErrMsg(getErrorMessage(err));
      setPwd('');
      setConfirmPwd('');
      errRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthLayout>
        <div className="w-full max-w-sm">
          <Alert className="bg-success-500/10 border border-success-500/20">
            <AlertTitle className="text-white">Account Created!</AlertTitle>
            <AlertDescription className="text-neutral-300">Redirecting to login...</AlertDescription>
          </Alert>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="grid w-full max-w-sm grid-cols-1 gap-8">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">O</span>
          </div>
          <Heading level={5} className="m-0">OghmaNotes</Heading>
        </div>

        <Heading level={2}>Create your account</Heading>

        {errMsg && (
          <div ref={errRef} role="alert">
            <Alert className="bg-error-500/10 border border-error-500/20">
              <AlertTitle className="text-error-400">Registration failed</AlertTitle>
              <AlertDescription className="text-error-300">{errMsg}</AlertDescription>
            </Alert>
          </div>
        )}

        <Field>
          <Label>Email address</Label>
          <Input
            type="email"
            name="email"
            placeholder="your@university.edu"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field>
          <Label>Password <span className="text-neutral-400 font-normal">(minimum 8 characters)</span></Label>
          <Input
            type="password"
            name="password"
            placeholder="••••••••"
            required
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
          />
        </Field>

        <Field>
          <Label>Confirm Password</Label>
          <Input
            type="password"
            name="confirmPassword"
            placeholder="••••••••"
            required
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
          />
        </Field>

        <Button
          type="submit"
          disabled={loading}
          color="dark/zinc"
          className="w-full"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </Button>

        <Text>
          Already have an account?{' '}
          <TextLink href="/login">
            <Strong>Sign in</Strong>
          </TextLink>
        </Text>
      </form>
    </AuthLayout>
  );
}
