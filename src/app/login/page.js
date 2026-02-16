"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getErrorMessage, login } from "@/lib/apiClient";
import { AuthLayout } from "@/components/catalyst/auth-layout";
import { Button } from "@/components/catalyst/button";
import { Input } from "@/components/catalyst/input";
import { Checkbox, CheckboxField } from "@/components/catalyst/checkbox";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Heading } from "@/components/catalyst/heading";
import { Text, TextLink, Strong } from "@/components/catalyst/text";
import { Alert, AlertTitle, AlertDescription } from "@/components/catalyst/alert";

export default function LoginPage() {
  const userRef = useRef(null);
  const errRef = useRef(null);
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    userRef.current?.focus();
  }, []);

  useEffect(() => {
    setErrMsg("");
  }, [email, pwd]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, pwd);
      setEmail("");
      setPwd("");
      setSuccess(true);
      setTimeout(() => router.push("/notes"), 1500);
    } catch (err) {
      setErrMsg(getErrorMessage(err));
      setPwd("");
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
            <AlertTitle className="text-white">Login Successful!</AlertTitle>
            <AlertDescription className="text-neutral-300">Redirecting...</AlertDescription>
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

        <Heading level={2}>Sign in to your account</Heading>

        {errMsg && (
          <div ref={errRef} role="alert">
            <Alert className="bg-error-500/10 border border-error-500/20">
              <AlertTitle className="text-error-400">Sign in failed</AlertTitle>
              <AlertDescription className="text-error-300">{errMsg}</AlertDescription>
            </Alert>
          </div>
        )}

        <Field>
          <Label>Email address</Label>
          <Input
            ref={userRef}
            type="email"
            name="email"
            placeholder="your@university.edu"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field>
          <Label>Password</Label>
          <Input
            id="password"
            type="password"
            name="password"
            placeholder="••••••••"
            required
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
          />
        </Field>

        <div className="flex items-center justify-between">
          <CheckboxField>
            <Checkbox name="remember" />
            <Label>Remember me</Label>
          </CheckboxField>
          <Text>
            <TextLink href="/forgot-password">
              <Strong>Forgot password?</Strong>
            </TextLink>
          </Text>
        </div>

        <Button
          type="submit"
          disabled={loading}
          color="dark/zinc"
          className="w-full"
        >
          {loading ? "Signing in..." : "Sign in"}
        </Button>

        <Text>
          Don't have an account?{" "}
          <TextLink href="/register">
            <Strong>Create one</Strong>
          </TextLink>
        </Text>
      </form>
    </AuthLayout>
  );
}
