"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "../lib/auth";
import { Shell } from "./shell";

// Redirects unauthenticated admins to /login and keeps signed-in admins out of it.
function AuthGate({ children }: { children: React.ReactNode }) {
  const { admin, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  // Login is the only public page — there is no sign-up. Admins are created from /account.
  const isPublic = pathname === "/login";

  useEffect(() => {
    if (loading) return;
    if (!admin && !isPublic) router.replace("/login");
    if (admin && isPublic) router.replace("/");
  }, [admin, loading, isPublic, router]);

  if (loading) {
    return <div className="p-10 text-center text-zinc-500">Loading…</div>;
  }
  // The login screen renders bare (no sidebar/header).
  if (isPublic) return admin ? null : <>{children}</>;
  // Avoid flashing protected content while redirecting.
  if (!admin) return null;

  return <Shell>{children}</Shell>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGate>{children}</AuthGate>
    </AuthProvider>
  );
}
