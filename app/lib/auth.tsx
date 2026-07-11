"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { api, Admin, getToken, setToken, clearToken } from "./api";

type AuthValue = {
  admin: Admin | null;
  loading: boolean;
  register: (name: string, mobile: string, password: string) => Promise<void>;
  login: (mobile: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);

  // On load, validate any stored token against the backend.
  useEffect(() => {
    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { admin } = await api.me();
        setAdmin(admin);
      } catch {
        clearToken();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function register(name: string, mobile: string, password: string) {
    const { token, admin } = await api.register(name, mobile, password);
    setToken(token);
    setAdmin(admin);
  }

  async function login(mobile: string, password: string) {
    const { token, admin } = await api.login(mobile, password);
    setToken(token);
    setAdmin(admin);
  }

  function logout() {
    clearToken();
    setAdmin(null);
  }

  return (
    <AuthContext.Provider value={{ admin, loading, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
