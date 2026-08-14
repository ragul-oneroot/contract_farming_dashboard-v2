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
   * The FPO this farmer belongs to, chosen at onboarding from the FPOs
   * agronomists have registered. Null when none was recorded. Farmers only.
   */
  fpo?: { _id: string; name: string; mobile: string } | null;
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
/**
 * A Farmer Producer Organisation onboarded by a field agent.
 *
 * `agronomist` is the id only — the backend does not populate it here, so the
 * page resolves names against the agronomist list it already loads.
 */
export type Fpo = {
  _id: string;
  name: string;
  mobile: string;
  role: string;
  photoUrl: string;
  /** Other people at the same FPO. Empty when only one contact was taken. */
  members?: { name: string; mobile: string; designation: string }[];
  crops: string[];
  /** As stated by the FPO on the day. A claim, not a figure we can verify. */
  farmerCount: number;
  location: { latitude: number | null; longitude: number | null };
  /**
   * Whether the pin is where the agent stood ("gps") or a place they searched
   * for ("search"). Only a GPS pin is evidence of where the agent was.
   */
  locationSource?: "gps" | "search" | "";
  /** Reverse-geocoded from `location`, never typed — so it groups reliably. */
  address?: FarmAddress;
  agronomist: string | null;
  createdAt: string;
};

/**
 * One page of FPOs. `total` and `totals` describe the whole filtered set, so
 * the footer figures do not grow as the user pages through.
 */
/**
 * One page of anything. `total` covers everything the filters match, not just
 * `items`, so a footer count does not grow as the user pages through.
 */
export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export type FpoPage = {
  items: Fpo[];
  total: number;
  totals: { farmers: number };
  page: number;
  limit: number;
  hasMore: boolean;
};

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

/**
 * A stretch the agent stepped out of the working day — lunch, an errand, a
 * breakdown. Recording stops, and the distance covered in between is left out
 * of the day's total, so each one carries a reason and a photo.
 *
 * `resumedAt` is null while the pause is still running.
 */
export type TrackingPause = {
  pausedAt: string;
  resumedAt: string | null;
  reason: string;
  photoUrl?: string;
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
  /** Stretches the agent stepped out of the day. Absent on older sessions. */
  pauses?: TrackingPause[];
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
  /** Farmers a page at a time. Search and filters all applied server-side. */
  listFarmersPage: (params: {
    agronomist?: string;
    onboardedBy?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) => {
    const q = new URLSearchParams();
    if (params.agronomist) q.set("agronomist", params.agronomist);
    if (params.onboardedBy) q.set("onboardedBy", params.onboardedBy);
    if (params.search) q.set("search", params.search);
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    q.set("page", String(params.page ?? 1));
    q.set("limit", String(params.limit ?? 20));
    return json<Paged<Person>>(`/api/users/farmers?${q.toString()}`);
  },

  /** Agronomists a page at a time. The farmer counts cover the given window. */
  listAgronomistsPage: (params: {
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) => {
    const q = new URLSearchParams();
    if (params.search) q.set("search", params.search);
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    q.set("page", String(params.page ?? 1));
    q.set("limit", String(params.limit ?? 20));
    return json<Paged<Person>>(`/api/users/agronomists?${q.toString()}`);
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

  /**
   * Products a page at a time, searched on the server.
   *
   * Separate from `listProducts` above because several screens still want the
   * whole catalogue for a dropdown, and sending `page` changes the shape.
   */
  listProductsPage: (params: { search?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params.search) q.set("search", params.search);
    q.set("page", String(params.page ?? 1));
    q.set("limit", String(params.limit ?? 20));
    return json<Paged<Product>>(`/api/products?${q.toString()}`);
  },
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

  // FPOs onboarded by field agents. `search` covers only the names and numbers
  // of everyone on the record; role, crop and area are separate filters.
  listFpos: (params?: {
    search?: string;
    role?: string;
    crop?: string;
    agronomist?: string;
    district?: string;
    taluk?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.role) q.set("role", params.role);
    if (params?.crop) q.set("crop", params.crop);
    if (params?.agronomist) q.set("agronomist", params.agronomist);
    if (params?.district) q.set("district", params.district);
    if (params?.taluk) q.set("taluk", params.taluk);
    const qs = q.toString();
    return json<Fpo[]>(`/api/fpos${qs ? `?${qs}` : ""}`);
  },

  /**
   * The same list, a page at a time. `total` and `totals` cover everything the
   * filters match, not just the page, so the footer can state real figures
   * without the dashboard holding every row.
   */
  listFposPage: (params: {
    search?: string;
    role?: string;
    crop?: string;
    agronomist?: string;
    district?: string;
    taluk?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) => {
    const q = new URLSearchParams();
    if (params.search) q.set("search", params.search);
    if (params.role) q.set("role", params.role);
    if (params.crop) q.set("crop", params.crop);
    if (params.agronomist) q.set("agronomist", params.agronomist);
    if (params.district) q.set("district", params.district);
    if (params.taluk) q.set("taluk", params.taluk);
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    q.set("page", String(params.page ?? 1));
    q.set("limit", String(params.limit ?? 12));
    return json<FpoPage>(`/api/fpos?${q.toString()}`);
  },

  // Tracked work days. The list omits routes — they are thousands of points each.
  listTracking: (params?: { userId?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.userId) q.set("user", params.userId);
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    const qs = q.toString();
    return json<TrackingSession[]>(`/api/tracking${qs ? `?${qs}` : ""}`);
  },
  /**
   * Tracking a page at a time. `totals` covers every session the filters
   * match, not just the page — distance and hours describe a period, and a
   * figure that grew while paging would describe nothing at all.
   */
  listTrackingPage: (params: {
    userId?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) => {
    const q = new URLSearchParams();
    if (params.userId) q.set("user", params.userId);
    if (params.search) q.set("search", params.search);
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    q.set("page", String(params.page ?? 1));
    q.set("limit", String(params.limit ?? 20));
    return json<
      Paged<TrackingSession> & {
        totals: { km: number; hours: number; tracked: number; live: number; off: number };
      }
    >(`/api/tracking?${q.toString()}`);
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
