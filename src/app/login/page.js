"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getErrorMessage, login } from "@/lib/apiClient";

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
      const data = await login(email, pwd);
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
      <div className="flex min-h-screen items-center justify-center bg-neutral-900 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          <div className="rounded-lg bg-success-500/10 p-8 text-center outline outline-1 -outline-offset-1 outline-success-500/20">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Login Successful!
            </h2>
            <p className="mt-2 text-neutral-300">Redirecting to home...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col justify-center bg-neutral-900 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h1 className="text-center text-3xl font-bold tracking-tight text-white">
          SocsBoard
        </h1>
        <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-white">
          Sign in to your account
        </h2>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]">
        <div className="rounded-lg bg-neutral-800/50 px-6 py-12 outline outline-1 -outline-offset-1 outline-white/10 sm:px-12">
          {errMsg && (
            <div
              ref={errRef}
              role="alert"
              className="mb-6 rounded-md bg-error-500/10 p-4 text-error-400 outline outline-1 outline-error-500/20"
            >
              <p className="text-sm font-medium">{errMsg}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-white"
              >
                Email address
              </label>
              <div className="mt-2">
                <input
                  ref={userRef}
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline outline-1 -outline-offset-1 outline-white/10 placeholder:text-neutral-500 focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-white"
              >
                Password
              </label>
              <div className="mt-2">
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline outline-1 -outline-offset-1 outline-white/10 placeholder:text-neutral-500 focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500 sm:text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full justify-center rounded-md bg-primary-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="mt-10 text-center text-sm text-neutral-400">
            Don't have an account?{" "}
            <Link
              href="/register"
              className="font-semibold text-primary-400 hover:text-primary-300"
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
