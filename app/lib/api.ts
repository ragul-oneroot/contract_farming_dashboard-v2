export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

export type Person = {
  _id: string;
  name: string;
  mobile: string;
  location: { latitude: number | null; longitude: number | null };
  geofence?: { latitude: number; longitude: number }[]; // farm-boundary polygon
  agronomist?: { _id: string; name: string; mobile: string } | null;
  createdAt: string;
};

export type PopStep = {
  day: [number, number];
  category: string;
  operation: string;
  details: string;
  products?: string[]; // product IDs used on this step/day
};

export type Practice = {
  _id: string;
  crop: string;
  key: string;
  durationDays: number;
  steps: PopStep[];
};

export type Product = {
  _id: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  imageUrl: string;
  crops: string[]; // crop names this product is mapped to; empty = all crops
  dayStart: number | null; // usage window in days from planting
  dayEnd: number | null;
  createdAt: string;
};

export type Admin = { _id: string; name: string; mobile: string };

export type CatalogCrop = {
  _id: string;
  name: string;
  imageUrl: string;
  varieties: string[];
  createdAt: string;
};

export type CropProgress = {
  stepIndex: number;
  done: boolean;
  imageUrl: string;
  completedAt: string;
};

export type CropProductProgress = {
  productId: string;
  imageUrl: string;
  completedAt: string;
};

export type CropVerification = {
  day: number;
  dayEnd: number | null;
  operation: string;
  status: "done" | "not_done";
  imageUrl: string;
  note: string;
  agronomist: string | null;
  verifiedAt: string;
};

export type Crop = {
  _id: string;
  user: string;
  name: string;
  variety: string;
  dop: string | null;
  quantity: number | null;
  unit: string;
  notes: string;
  progress: CropProgress[];
  productProgress?: CropProductProgress[];
  verifications?: CropVerification[];
  createdAt: string;
};

export type PackageOfPractices = {
  crop: string;
  durationDays: number;
  steps: PopStep[];
};

export type OrderItem = {
  product: string;
  name: string;
  price: number;
  unit: string;
  imageUrl: string;
  qty: number;
};

export type OrderStatus = "pending" | "confirmed" | "delivered" | "cancelled";

export type Order = {
  _id: string;
  user: string;
  farmerName: string;
  farmerMobile: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  createdAt: string;
};

const TOKEN_KEY = "oneroot_admin_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

// Attach the admin bearer token to every request (backend ignores it on public GETs).
function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function json<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
    cache: "no-store",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string })?.message || `Request failed (${res.status})`);
  return data as T;
}

// multipart (for image uploads) — do NOT set Content-Type, the browser adds the boundary.
async function form<T>(path: string, method: string, body: FormData): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    body,
    headers: authHeaders(),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string })?.message || `Request failed (${res.status})`);
  return data as T;
}

export type CallLog = {
  _id: string;
  agronomist: { _id: string; name: string; mobile: string } | null;
  agronomistMobile?: string;
  farmer: string | null;
  farmerName: string;
  farmerMobile: string;
  provider?: string;
  callUUID?: string;
  status?: string;
  duration?: number;
  recordingUrl?: string;
  calledAt: string;
  createdAt: string;
};

export const api = {
  // Admin auth
  register: (name: string, mobile: string, password: string) =>
    json<{ token: string; admin: Admin }>("/api/admin/register", {
      method: "POST",
      body: JSON.stringify({ name, mobile, password }),
    }),
  login: (mobile: string, password: string) =>
    json<{ token: string; admin: Admin }>("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ mobile, password }),
    }),
  me: () => json<{ admin: Admin }>("/api/admin/me"),

  // Users
  listFarmers: () => json<Person[]>("/api/users/farmers"),
  listAgronomists: () => json<Person[]>("/api/users/agronomists"),
  getUser: (id: string) => json<Person & { role: string }>(`/api/users/${id}`),
  assignAgronomist: (farmerId: string, agronomistId: string | null) =>
    json<Person>(`/api/users/${farmerId}/agronomist`, {
      method: "PATCH",
      body: JSON.stringify({ agronomistId }),
    }),
  listUserCrops: (userId: string) => json<Crop[]>(`/api/users/${userId}/crops`),
  getPractices: (crop: string) =>
    json<PackageOfPractices>(`/api/practices/${encodeURIComponent(crop)}`),
  listUserOrders: (userId: string) => json<Order[]>(`/api/orders/user/${userId}`),

  // Package of Practices
  listPractices: () => json<Practice[]>("/api/practices"),
  createPractice: (body: { crop: string; durationDays: number; steps: PopStep[] }) =>
    json<Practice>("/api/practices", { method: "POST", body: JSON.stringify(body) }),
  updatePractice: (crop: string, body: { crop?: string; durationDays: number; steps: PopStep[] }) =>
    json<Practice>(`/api/practices/${encodeURIComponent(crop)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deletePractice: (crop: string) =>
    json<{ message: string }>(`/api/practices/${encodeURIComponent(crop)}`, { method: "DELETE" }),

  // Orders
  listOrders: (status?: string) =>
    json<Order[]>(`/api/orders${status ? `?status=${status}` : ""}`),
  updateOrderStatus: (id: string, status: OrderStatus) =>
    json<Order>(`/api/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  // Products
  listProducts: () => json<Product[]>("/api/products"),
  createProduct: (data: FormData) => form<Product>("/api/products", "POST", data),
  updateProduct: (id: string, data: FormData) => form<Product>(`/api/products/${id}`, "PUT", data),
  deleteProduct: (id: string) =>
    json<{ message: string }>(`/api/products/${id}`, { method: "DELETE" }),

  // Call logs (agronomist -> farmer, recorded via Plivo)
  listCallLogs: () => json<CallLog[]>("/api/call-logs"),

  // Crop catalog (crops a farmer can pick from in the app)
  listCropCatalog: () => json<CatalogCrop[]>("/api/crop-catalog"),
  createCropCatalog: (data: FormData) => form<CatalogCrop>("/api/crop-catalog", "POST", data),
  updateCropCatalog: (id: string, data: FormData) =>
    form<CatalogCrop>(`/api/crop-catalog/${id}`, "PUT", data),
  deleteCropCatalog: (id: string) =>
    json<{ message: string }>(`/api/crop-catalog/${id}`, { method: "DELETE" }),
};
