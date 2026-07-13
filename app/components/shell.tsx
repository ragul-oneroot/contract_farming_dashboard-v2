"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, Users, UserCog, Sprout, Package, Phone, ClipboardList, LogOut, ChevronLeft, Leaf } from "lucide-react";
import { useAuth } from "../lib/auth";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/farmers", label: "Farmers", icon: Users },
  { href: "/agronomists", label: "Agronomists", icon: UserCog },
  { href: "/crops", label: "Crops", icon: Sprout },
  { href: "/products", label: "Products", icon: Package },
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/reports", label: "Daily Reports", icon: ClipboardList },
];

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/farmers": "Farmers",
  "/agronomists": "Agronomists",
  "/crops": "Crops & Package of Practices",
  "/products": "Products",
  "/calls": "Call Logs & Recordings",
  "/reports": "Daily Reports",
};

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { admin, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen flex-col">
      {/* Top green bar */}
      <header className="flex h-14 items-center gap-3 bg-green-700 px-4 text-white">
        <div className="flex items-center gap-2" style={{ width: collapsed ? 56 : 208 }}>
          <span className="flex h-8 items-center gap-1.5 rounded-md bg-white/15 px-2 font-bold">
            <Leaf size={16} /> {!collapsed && "OneRoot"}
          </span>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="ml-auto rounded p-1 hover:bg-white/15"
            title="Toggle sidebar"
          >
            <ChevronLeft size={18} className={collapsed ? "rotate-180 transition" : "transition"} />
          </button>
        </div>
        <h1 className="text-lg font-semibold">{TITLES[pathname] ?? "OneRoot Admin"}</h1>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm">
            <span className="opacity-80">👤 </span>
            {admin?.name}
          </span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-1.5 text-sm font-medium hover:bg-red-600"
          >
            <LogOut size={15} /> Logout
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className="shrink-0 overflow-y-auto border-r border-zinc-200 bg-white transition-all dark:border-zinc-800 dark:bg-zinc-950"
          style={{ width: collapsed ? 56 : 224 }}
        >
          <nav className="flex flex-col gap-1 p-2">
            {NAV.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  }`}
                >
                  <Icon size={18} className="shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-zinc-50 p-6 dark:bg-black">{children}</main>
      </div>
    </div>
  );
}
