export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

// Where the farm is, reverse-geocoded from the centre of the farmer's boundary by the backend.
// Empty strings mean "no boundary drawn yet" or "geocoder couldn't place it".
export type FarmAddress = {
  village?: string;
  taluk?: string;
  district?: string;
  state?: string;
  geocodedAt?: string | null;
};

export type Person = {
  _id: string;
  name: string;
  mobile: string;
  location: { latitude: number | null; longitude: number | null };
  geofence?: { latitude: number; longitude: number }[]; // farm-boundary polygon
  farmAddress?: FarmAddress;
  agronomist?: { _id: string; name: string; mobile: string } | null;
  /** The agronomist who registered this farmer. Null = added from the dashboard. */
  onboardedBy?: { _id: string; name: string; mobile: string } | null;
  /**
   * The day we want this farmer visited. Shows against them in the app's
   * Dashboard tab under Farm Visits. Null when no date was set. Farmers only.
   */
  visitDate?: string | null;
  /**
   * What the field agent decided about this farmer on their last visit.
   *
   * `nextFollowUpAt` is when they said they would come back, and is cleared by
   * the next visit — so a date sitting here is work still owed. `skippedAt` is
   * the opposite: the agent looked at the row and decided no trip was needed,
   * and `skipReason` is why. Farmers only.
   */
  nextFollowUpAt?: string | null;
  followUpNote?: string;
  skippedAt?: string | null;
  skipReason?: string;
  /**
   * When a follow-up that was actually owed got done. Only set if a date was
   * pending when the visit was marked, so it means "came back as promised"
   * rather than merely "was visited at some point".
   */
  lastFollowUpDoneAt?: string | null;
  /** When this farmer was last visited, follow-up or not. */
  lastVisitedAt?: string | null;
  createdAt: string;
  /** Corners in the farm boundary; 0 when none drawn yet. Farmers only. */
  geofenceCount?: number;
  /** Crops this farmer has added. Farmers only. */
  cropCount?: number;
  /** Farmers this agronomist registered themselves. Agronomists only. */
  onboardedCount?: number;
  /** Farmers handed to them — added from the dashboard or reassigned. Agronomists only. */
  assignedCount?: number;
  /** The conversation recorded while this farmer was onboarded. Farmers only. */
  onboardingAudioUrl?: string;
  onboardingAudioAt?: string | null;
  onboardingAudioSeconds?: number;
};

/** A farmer is only fully set up once they have an agronomist, a farm boundary
 *  and at least one crop. Returns the human-readable list of what is missing. */
export function missingDetails(p: Person): string[] {
  const missing: string[] = [];
  if (!p.agronomist) missing.push("no agronomist");
  if ((p.geofenceCount ?? 0) < 3) missing.push("no farm boundary");
  if ((p.cropCount ?? 0) < 1) missing.push("no crop");
  return missing;
}

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

export type Admin = { _id: string; name: string; mobile: string; createdAt?: string };

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
  kind?: "operation" | "product";
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

export type DailyReport = {
  _id: string;
  user: { _id: string; name: string; mobile: string } | null;
  userName: string;
  role: string;
  dailyReport: string;
  dailyExpenses: string;
  expectedExpensesTomorrow: string;
  planOfActionTomorrow: string;
  /** Measured at submission — absent on reports filed before tracking existed. */
  stats?: {
    distanceKm: number;
    trackedMinutes: number;
    sessions: number;
    newFarmers: number;
    oldFarmers: number;
    visits: number;
    sales: number;
    salesTotal: number;
  };
  date: string;
  createdAt: string;
};

export type Visit = {
  _id: string;
  agronomist: { _id: string; name: string; mobile: string } | null;
  farmer: { _id: string; name: string; mobile: string } | null;
  farmerName: string;
  farmPhotoUrl: string;
  farmerPhotoUrl: string;
  location: { latitude: number | null; longitude: number | null };
  notes: string;
  visitedAt: string;
  createdAt: string;
};

/** One product line in a field sale, with its own before/after crop photos. */
export type ProductSaleItem = {
  product: string;
  name: string;
  unit: string;
  imageUrl: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  /** Taken at handover. */
  beforePhotoUrl: string;
  /** Taken on the follow-up visit a week later; empty until then. */
  afterPhotoUrl: string;
  afterPhotoAt: string | null;
};

/** A basket of products an agronomist sold to a farmer out on the farm. */
export type ProductSale = {
  _id: string;
  agronomist: { _id: string; name: string; mobile: string } | null;
  agronomistName: string;
  farmer: string;
  farmerName: string;
  farmerMobile: string;
  crop: string | null;
  cropName: string;
  items: ProductSaleItem[];
  total: number;
  location: { latitude: number | null; longitude: number | null };
  notes: string;
  soldAt: string;
  /** When the follow-up after-photos become collectable. */
  afterDueAt: string | null;
  createdAt: string;
};

/** A senior agronomist's answer to a disease report. */
export type DiseaseReply = {
  senior: string;
  seniorName: string;
  advice: string;
  at: string;
};

/** A crop a field agent photographed and sent up for advice. */
export type DiseaseReport = {
  _id: string;
  reporter: { _id: string; name: string; mobile: string; role: string } | null;
  reporterName: string;
  farmer: string | null;
  farmerName: string;
  farmerMobile: string;
  crop: string | null;
  cropName: string;
  photos: string[];
  note: string;
  location: { latitude: number | null; longitude: number | null };
  status: "open" | "answered";
  replies: DiseaseReply[];
  answeredAt: string | null;
  createdAt: string;
};

/** One GPS fix along a tracked route. */
export type TrackPoint = {
  latitude: number;
  longitude: number;
  at: string;
  accuracy?: number | null;
};

/** A tracked work day: START to END, with the route walked in between. */
export type TrackingSession = {
  _id: string;
  user: { _id: string; name: string; mobile: string; role: string } | null;
  userName: string;
  role: string;
  /** 'no_field' is a declared day in, with a reason instead of a route. */
  kind: "tracked" | "no_field";
  reason: string;
  startAt: string;
  endAt: string | null;
  startPhotoUrl: string;
  endPhotoUrl: string;
  /** Only the single-session fetch carries the route; the list omits it. */
  points?: TrackPoint[];
  distanceKm: number;
  createdAt: string;
};

/** A day's work, measured from what was recorded rather than typed. */
export type DayStats = {
  distanceKm: number;
  trackedMinutes: number;
  sessions: number;
  newFarmers: number;
  oldFarmers: number;
  visits: number;
  sales: number;
  salesTotal: number;
};

export const api = {
  // Admin auth. There is no register/sign-up: admins are created from the Account tab.
  login: (mobile: string, password: string) =>
    json<{ token: string; admin: Admin }>("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ mobile, password }),
    }),
  me: () => json<{ admin: Admin }>("/api/admin/me"),

  // Admin management (Account tab)
  listAdmins: () => json<Admin[]>("/api/admin"),
  createAdmin: (name: string, mobile: string, password: string) =>
    json<{ admin: Admin }>("/api/admin", {
      method: "POST",
      body: JSON.stringify({ name, mobile, password }),
    }),
  deleteAdmin: (id: string) => json<{ _id: string }>(`/api/admin/${id}`, { method: "DELETE" }),
  resetAdminPassword: (id: string, password: string) =>
    json<{ admin: Admin }>(`/api/admin/${id}/password`, {
      method: "PATCH",
      body: JSON.stringify({ password }),
    }),

  // Users
  /**
   * Farmers, filtered server-side.
   *
   * `agronomist` ('none' for unassigned) is who looks after them now;
   * `onboardedBy` ('none' for added from the dashboard) is who registered them
   * in the field. `from`/`to` are yyyy-mm-dd on the registration date.
   */
  listFarmers: (opts?: {
    agronomist?: string;
    onboardedBy?: string;
    from?: string;
    to?: string;
  }) => {
    const q = new URLSearchParams();
    if (opts?.agronomist) q.set("agronomist", opts.agronomist);
    // "none" means nobody registered them in the field — added from here.
    if (opts?.onboardedBy) q.set("onboardedBy", opts.onboardedBy);
    if (opts?.from) q.set("from", opts.from);
    if (opts?.to) q.set("to", opts.to);
    const qs = q.toString();
    return json<Person[]>(`/api/users/farmers${qs ? `?${qs}` : ""}`);
  },
  createFarmer: (body: {
    name: string;
    mobile: string;
    agronomistId?: string | null;
    crop?: string;
    variety?: string;
    dop?: string | null;
    /** yyyy-mm-dd — the day the assigned agronomist should visit. */
    visitDate?: string | null;
  }) => json<Person>("/api/users/farmers", { method: "POST", body: JSON.stringify(body) }),
  updateFarmer: (id: string, body: { name?: string; mobile?: string }) =>
    json<Person>(`/api/users/farmers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  // `from`/`to` (yyyy-mm-dd) narrow the onboarded/assigned counts to farmers
  // registered in that window.
  listAgronomists: (range?: { from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (range?.from) q.set("from", range.from);
    if (range?.to) q.set("to", range.to);
    const qs = q.toString();
    return json<Person[]>(`/api/users/agronomists${qs ? `?${qs}` : ""}`);
  },
  getUser: (id: string) => json<Person & { role: string }>(`/api/users/${id}`),
  /**
   * Assign (or unassign, with null) a farmer's agronomist.
   *
   * `visitDate` is only sent when given: omitting it leaves any date already on
   * the farmer alone, whereas passing "" clears it. Unassigning clears it
   * server-side regardless — a visit day with nobody to do it means nothing.
   */
  assignAgronomist: (farmerId: string, agronomistId: string | null, visitDate?: string | null) =>
    json<Person>(`/api/users/${farmerId}/agronomist`, {
      method: "PATCH",
      body: JSON.stringify(visitDate === undefined ? { agronomistId } : { agronomistId, visitDate }),
    }),
  listUserCrops: (userId: string) => json<Crop[]>(`/api/users/${userId}/crops`),
  addUserCrop: (
    userId: string,
    body: { name: string; variety?: string; dop?: string | null; area?: number | null }
  ) => json<Crop>(`/api/users/${userId}/crops`, { method: "POST", body: JSON.stringify(body) }),
  // Fill in or correct details on an existing crop — usually a missing D.O.P,
  // which the whole Package of Practices schedule is counted from.
  updateCrop: (
    cropId: string,
    body: { variety?: string; dop?: string | null; area?: number | null }
  ) => json<Crop>(`/api/crops/${cropId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteCrop: (cropId: string) =>
    json<{ message?: string }>(`/api/crops/${cropId}`, { method: "DELETE" }),
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

  // Daily reports submitted by field agents
  listDailyReports: () => json<DailyReport[]>("/api/daily-reports"),

  // Farm visits logged by agronomists
  listVisits: () => json<Visit[]>("/api/visits"),

  // Crops reported as diseased, and the advice sent back.
  listDiseaseReports: (status?: "open" | "answered") =>
    json<DiseaseReport[]>(`/api/disease-reports${status ? `?status=${status}` : ""}`),

  // Tracked work days. The list omits routes — they are thousands of points each.
  listTracking: (params?: { userId?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.userId) q.set("user", params.userId);
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    const qs = q.toString();
    return json<TrackingSession[]>(`/api/tracking${qs ? `?${qs}` : ""}`);
  },
  /** One session WITH its route, for the map. */
  getTrackingSession: (id: string) => json<TrackingSession>(`/api/tracking/${id}`),

  /** A single agent's measured numbers for one day. `date` is yyyy-mm-dd. */
  getDayStats: (userId: string, date?: string) => {
    const q = new URLSearchParams({ user: userId });
    if (date) q.set("date", date);
    return json<DayStats>(`/api/day-stats?${q.toString()}`);
  },

  // Products sold to farmers on the field. Optional filters narrow the list.
  listProductSales: (params?: { agronomistId?: string; farmerId?: string; since?: string }) => {
    const q = new URLSearchParams();
    if (params?.agronomistId) q.set("agronomist", params.agronomistId);
    if (params?.farmerId) q.set("farmer", params.farmerId);
    if (params?.since) q.set("since", params.since);
    const qs = q.toString();
    return json<ProductSale[]>(`/api/product-sales${qs ? `?${qs}` : ""}`);
  },

  // Crop catalog (crops a farmer can pick from in the app)
  listCropCatalog: () => json<CatalogCrop[]>("/api/crop-catalog"),
  createCropCatalog: (data: FormData) => form<CatalogCrop>("/api/crop-catalog", "POST", data),
  updateCropCatalog: (id: string, data: FormData) =>
    form<CatalogCrop>(`/api/crop-catalog/${id}`, "PUT", data),
  deleteCropCatalog: (id: string) =>
    json<{ message: string }>(`/api/crop-catalog/${id}`, { method: "DELETE" }),
};
