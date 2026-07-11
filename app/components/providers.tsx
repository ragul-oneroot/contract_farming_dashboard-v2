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
  const isPublic = pathname === "/login" || pathname === "/signup";

  useEffect(() => {
    if (loading) return;
    if (!admin && !isPublic) router.replace("/login");
    if (admin && isPublic) router.replace("/");
  }, [admin, loading, isPublic, router]);

  if (loading) {
    return <div className="p-10 text-center text-zinc-500">Loading…</div>;
  }
  // Login & signup screens render bare (no sidebar/header).
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
