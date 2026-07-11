"use client";

import { useState } from "react";
import Link from "next/link";
import { Leaf } from "lucide-react";
import { useAuth } from "../lib/auth";

export default function SignupPage() {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(name.trim(), mobile.trim(), password);
      // AuthGate redirects to "/" once admin is set.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-600 text-white">
            <Leaf size={24} />
          </span>
          <h1 className="text-xl font-semibold">Create admin account</h1>
          <p className="text-sm text-zinc-500">OneRoot dashboard</p>
        </div>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-zinc-500">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
          />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-zinc-500">Mobile number</span>
          <input
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            inputMode="numeric"
            placeholder="9999999999"
            className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
          />
        </label>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-zinc-500">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 4 characters"
            className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
          />
        </label>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-green-600 px-4 py-2.5 font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create account"}
        </button>

        <p className="mt-4 text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-green-700 hover:underline dark:text-green-400">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
