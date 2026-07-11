"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Phone, User } from "lucide-react";
import { api, Order, OrderStatus } from "../lib/api";

const STATUSES: OrderStatus[] = ["pending", "confirmed", "delivered", "cancelled"];

const STATUS_STYLE: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  delivered: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

function fmt(s: string) {
  return new Date(s).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"" | OrderStatus>("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setOrders(await api.listOrders(filter || undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function changeStatus(order: Order, status: OrderStatus) {
    const prev = order.status;
    setOrders((os) => os.map((o) => (o._id === order._id ? { ...o, status } : o)));
    try {
      await api.updateOrderStatus(order._id, status);
      if (filter && status !== filter) {
        setOrders((os) => os.filter((o) => o._id !== order._id));
      }
    } catch (e) {
      setOrders((os) => os.map((o) => (o._id === order._id ? { ...o, status: prev } : o)));
      setError(e instanceof Error ? e.message : "Could not update status");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          Orders <span className="text-zinc-400">({orders.length})</span>
        </h1>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "" | OrderStatus)}
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
          >
            <option value="" className="dark:bg-zinc-900">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize dark:bg-zinc-900">
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={load}
            className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="mt-6 text-zinc-500">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="mt-6 text-zinc-500">No orders yet.</p>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {orders.map((o) => (
            <div
              key={o._id}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              {/* Farmer + date */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-semibold">
                    <User size={15} className="text-zinc-400" />
                    {o.farmerName || "Unknown farmer"}
                  </div>
                  <a
                    href={`tel:${o.farmerMobile}`}
                    className="mt-0.5 flex items-center gap-2 text-sm text-zinc-500 hover:text-green-600"
                  >
                    <Phone size={14} /> {o.farmerMobile || "—"}
                  </a>
                </div>
                <span className="text-xs text-zinc-400">{fmt(o.createdAt)}</span>
              </div>

              {/* Items */}
              <div className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
                {o.items.map((it, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.imageUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"}
                      alt={it.name}
                      className="h-10 w-10 rounded bg-zinc-100 object-cover dark:bg-zinc-900"
                    />
                    <div className="flex-1 text-sm">
                      <div className="font-medium">{it.name}</div>
                      <div className="text-zinc-500">
                        ₹{it.price} {it.unit} × {it.qty}
                      </div>
                    </div>
                    <div className="text-sm font-medium">₹{it.price * it.qty}</div>
                  </div>
                ))}
              </div>

              {/* Footer: total + status */}
              <div className="mt-3 flex items-center justify-between">
                <div className="text-sm">
                  Total: <span className="font-semibold text-green-600">₹{o.total}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLE[o.status]}`}>
                    {o.status}
                  </span>
                  <select
                    value={o.status}
                    onChange={(e) => changeStatus(o, e.target.value as OrderStatus)}
                    className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-sm capitalize dark:border-zinc-700"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s} className="capitalize dark:bg-zinc-900">
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
