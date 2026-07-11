"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Users,
  UserCog,
  Leaf,
  Package,
  ShoppingCart,
  Plus,
  ArrowRight,
  Clock,
  TrendingUp,
} from "lucide-react";
import { api, CatalogCrop, Order, OrderStatus, Person, Product } from "./lib/api";
import { useAuth } from "./lib/auth";

const STATUS_STYLE: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  delivered: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export default function Home() {
  const { admin } = useAuth();
  const [farmers, setFarmers] = useState<Person[]>([]);
  const [agronomists, setAgronomists] = useState<Person[]>([]);
  const [crops, setCrops] = useState<CatalogCrop[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [f, a, c, p, o] = await Promise.all([
          api.listFarmers().catch(() => []),
          api.listAgronomists().catch(() => []),
          api.listCropCatalog().catch(() => []),
          api.listProducts().catch(() => []),
          api.listOrders().catch(() => []),
        ]);
        setFarmers(f);
        setAgronomists(a);
        setCrops(c);
        setProducts(p);
        setOrders(o);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const pending = orders.filter((o) => o.status === "pending").length;
  const unassigned = farmers.filter((f) => !f.agronomist).length;

  const stats = [
    { label: "Farmers", value: farmers.length, href: "/farmers", icon: Users, color: "text-green-600 bg-green-100 dark:bg-green-950/40" },
    { label: "Agronomists", value: agronomists.length, href: "/agronomists", icon: UserCog, color: "text-teal-600 bg-teal-100 dark:bg-teal-950/40" },
    { label: "Crops", value: crops.length, href: "/crops", icon: Leaf, color: "text-amber-600 bg-amber-100 dark:bg-amber-950/40" },
    { label: "Products", value: products.length, href: "/products", icon: Package, color: "text-blue-600 bg-blue-100 dark:bg-blue-950/40" },
    { label: "Orders", value: orders.length, href: "/orders", icon: ShoppingCart, color: "text-purple-600 bg-purple-100 dark:bg-purple-950/40" },
  ];

  const actions = [
    { label: "Add a crop", href: "/crops", icon: Leaf },
    { label: "Add a product", href: "/products", icon: Package },
    { label: "Review orders", href: "/orders", icon: ShoppingCart },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome back{admin?.name ? `, ${admin.name}` : ""} 👋
        </h1>
        <p className="mt-1 text-zinc-500">Here’s what’s happening across the OneRoot app today.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.label}
              href={s.href}
              className="group rounded-2xl border border-zinc-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-green-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950"
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.color}`}>
                <Icon size={20} />
              </span>
              <div className="mt-3 text-3xl font-bold tabular-nums">{loading ? "—" : s.value}</div>
              <div className="mt-0.5 flex items-center gap-1 text-sm text-zinc-500">
                {s.label}
                <ArrowRight size={13} className="opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Attention banners */}
      {!loading && (pending > 0 || unassigned > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {pending > 0 && (
            <Link
              href="/orders"
              className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/30"
            >
              <Clock className="text-amber-600" size={22} />
              <div className="flex-1">
                <div className="font-semibold text-amber-800 dark:text-amber-300">
                  {pending} order{pending > 1 ? "s" : ""} awaiting confirmation
                </div>
                <div className="text-sm text-amber-700/80 dark:text-amber-400/80">Tap to review and update status</div>
              </div>
              <ArrowRight size={18} className="text-amber-600" />
            </Link>
          )}
          {unassigned > 0 && (
            <Link
              href="/farmers"
              className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/30"
            >
              <UserCog className="text-blue-600" size={22} />
              <div className="flex-1">
                <div className="font-semibold text-blue-800 dark:text-blue-300">
                  {unassigned} farmer{unassigned > 1 ? "s" : ""} without an agronomist
                </div>
                <div className="text-sm text-blue-700/80 dark:text-blue-400/80">Assign one from the farmer’s page</div>
              </div>
              <ArrowRight size={18} className="text-blue-600" />
            </Link>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.label}
                href={a.href}
                className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
              >
                <Plus size={15} />
                <Icon size={15} />
                {a.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Recent activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent farmers */}
        <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-100 p-4 dark:border-zinc-800">
            <h3 className="flex items-center gap-2 font-semibold">
              <Users size={16} className="text-green-600" /> Recent farmers
            </h3>
            <Link href="/farmers" className="text-sm text-green-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {loading ? (
              <p className="p-4 text-sm text-zinc-500">Loading…</p>
            ) : farmers.length === 0 ? (
              <p className="p-4 text-sm text-zinc-500">No farmers yet.</p>
            ) : (
              farmers.slice(0, 5).map((f) => (
                <Link
                  key={f._id}
                  href={`/farmers/${f._id}`}
                  className="flex items-center gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-600 text-sm font-semibold text-white">
                    {f.name?.charAt(0)?.toUpperCase() ?? "?"}
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{f.name}</div>
                    <div className="text-xs text-zinc-500">{f.mobile}</div>
                  </div>
                  <span className="text-xs text-zinc-400">
                    {f.agronomist ? f.agronomist.name : "Unassigned"}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent orders */}
        <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-100 p-4 dark:border-zinc-800">
            <h3 className="flex items-center gap-2 font-semibold">
              <TrendingUp size={16} className="text-green-600" /> Recent orders
            </h3>
            <Link href="/orders" className="text-sm text-green-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {loading ? (
              <p className="p-4 text-sm text-zinc-500">Loading…</p>
            ) : orders.length === 0 ? (
              <p className="p-4 text-sm text-zinc-500">No orders yet.</p>
            ) : (
              orders.slice(0, 5).map((o) => (
                <div key={o._id} className="flex items-center gap-3 p-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{o.farmerName || "Farmer"}</div>
                    <div className="text-xs text-zinc-500">
                      {o.items.length} item{o.items.length > 1 ? "s" : ""} · {fmtDate(o.createdAt)}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-green-600">₹{o.total}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[o.status]}`}>
                    {o.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
