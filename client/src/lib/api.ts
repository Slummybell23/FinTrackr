import type {
  AuthUser,
  Category,
  CategoryUpsert,
  ChallengeKind,
  Debt,
  DebtKind,
  Entry,
  EntryKind,
  EntryTemplate,
  ImportProfile,
  MonthSummary,
  NewEntry,
  ProposeResult,
  NewRecurring,
  PatternSuggestion,
  RecurringItem,
  ReviewSummary,
  SavingsGoal,
  SpendingChallenge,
  Vendor,
  YearSummary,
} from "./types";
import { resetThemeToDefaults } from "./theme";

/** Fired when the session has expired so the app can fall back to the sign-in page. */
export const UNAUTHORIZED_EVENT = "fintrackr:unauthorized";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (res.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.status === 204 ? (undefined as T) : res.json();
}

/**
 * The service worker caches /api responses for offline reading; drop them
 * whenever the signed-in user changes so ledgers never bleed across accounts.
 */
export async function clearApiCache() {
  if ("caches" in window) await caches.delete("api");
}

async function credentialRequest(path: string, body: object): Promise<AuthUser> {
  const res = await fetch(`/api/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return res.json();
  if (res.status === 401) throw new Error("Wrong email or password.");
  const problem = await res.json().catch(() => null);
  throw new Error(problem?.errors?.join(" ") ?? "Something went wrong.");
}

export const auth = {
  me: async (): Promise<AuthUser | null> => {
    const res = await fetch("/api/auth/me");
    return res.ok ? res.json() : null;
  },
  login: (email: string, password: string) =>
    credentialRequest("/login", { email, password }),
  register: (email: string, password: string) =>
    credentialRequest("/register", { email, password }),
  logout: async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await clearApiCache();
    resetThemeToDefaults();
  },
  updateSettings: (settings: {
    currency?: string;
    rolloverBudgets?: boolean;
    theme?: string;
    monthlySavingsTarget?: number;
    savingsRateTarget?: number;
    overspendNudge?: boolean;
    reflection?: boolean;
    challenges?: boolean;
  }) => request<AuthUser>("/auth/settings", { method: "PUT", body: JSON.stringify(settings) }),
  changePassword: async (currentPassword: string, newPassword: string) => {
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (res.ok) return;
    const problem = await res.json().catch(() => null);
    throw new Error(problem?.errors?.join(" ") ?? "Couldn't change the password.");
  },
  freshStart: async (password: string) => {
    const res = await fetch("/api/auth/fresh-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const problem = await res.json().catch(() => null);
      throw new Error(problem?.error ?? "Couldn't start the fresh book.");
    }
    // The offline cache still holds the old ledger; drop it with the data.
    await clearApiCache();
  },
  deleteAccount: async (password: string) => {
    const res = await fetch("/api/auth/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const problem = await res.json().catch(() => null);
      throw new Error(problem?.error ?? "Couldn't delete the account.");
    }
    await clearApiCache();
    resetThemeToDefaults();
  },
};

export const api = {
  serverVersion: () =>
    request<{ status: string; version: string }>("/health").then((h) => h.version),
  monthSummary: (month: string) => request<MonthSummary>(`/summary/month/${month}`),
  yearSummary: (year: number) => request<YearSummary>(`/summary/year/${year}`),
  review: () => request<ReviewSummary>("/summary/review"),
  patterns: () => request<PatternSuggestion[]>("/summary/patterns"),

  entries: (
    params: {
      month?: string;
      search?: string;
      categoryId?: number;
      kind?: EntryKind;
      minAmount?: number;
      maxAmount?: number;
      tag?: string;
      vendorId?: number;
      limit?: number;
      offset?: number;
    } = {},
  ) => {
    const qs = new URLSearchParams();
    if (params.month) qs.set("month", params.month);
    if (params.search) qs.set("search", params.search);
    if (params.categoryId != null) qs.set("categoryId", String(params.categoryId));
    if (params.kind) qs.set("kind", params.kind);
    if (params.minAmount != null) qs.set("minAmount", String(params.minAmount));
    if (params.maxAmount != null) qs.set("maxAmount", String(params.maxAmount));
    if (params.tag) qs.set("tag", params.tag);
    if (params.vendorId != null) qs.set("vendorId", String(params.vendorId));
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.offset != null) qs.set("offset", String(params.offset));
    const suffix = qs.size ? `?${qs}` : "";
    return request<Entry[]>(`/entries${suffix}`);
  },
  entry: (id: number) => request<Entry>(`/entries/${id}`),
  markWorth: (id: number, worth: "Worth" | "Regret" | null) =>
    request<Entry>(`/entries/${id}/worth`, { method: "POST", body: JSON.stringify({ worth }) }),
  createEntry: (entry: NewEntry) =>
    request<Entry>("/entries", { method: "POST", body: JSON.stringify(entry) }),
  updateEntry: (id: number, entry: NewEntry) =>
    request<Entry>(`/entries/${id}`, { method: "PUT", body: JSON.stringify(entry) }),
  deleteEntry: (id: number) => request<void>(`/entries/${id}`, { method: "DELETE" }),

  categories: () => request<Category[]>("/categories"),
  createCategory: (category: CategoryUpsert) =>
    request<Category>("/categories", { method: "POST", body: JSON.stringify(category) }),
  updateCategory: (id: number, category: CategoryUpsert) =>
    request<Category>(`/categories/${id}`, { method: "PUT", body: JSON.stringify(category) }),
  deleteCategory: (id: number) => request<void>(`/categories/${id}`, { method: "DELETE" }),

  vendors: () => request<Vendor[]>("/vendors"),
  updateVendor: (id: number, vendor: { name: string; alias: string | null; defaultCategoryId: number | null }) =>
    request<Vendor>(`/vendors/${id}`, { method: "PUT", body: JSON.stringify(vendor) }),
  deleteVendor: (id: number) => request<void>(`/vendors/${id}`, { method: "DELETE" }),
  mergeVendors: (sourceId: number, targetId: number) =>
    request<Vendor>(`/vendors/${sourceId}/merge/${targetId}`, { method: "POST" }),

  uploadReceipt: async (entryId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/entries/${entryId}/receipt`, { method: "POST", body: form });
    if (!res.ok) {
      const problem = await res.json().catch(() => null);
      throw new Error(problem?.error ?? "Couldn't attach the receipt.");
    }
  },
  deleteReceipt: (entryId: number) =>
    request<void>(`/entries/${entryId}/receipt`, { method: "DELETE" }),

  adminBackup: () => request<{ file: string }>("/admin/backup", { method: "POST" }),
  adminBackups: () => request<string[]>("/admin/backups"),
  restoreDatabase: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/admin/database", { method: "POST", body: form });
    if (!res.ok) {
      const problem = await res.json().catch(() => null);
      throw new Error(problem?.error ?? "Restore failed.");
    }
    await clearApiCache();
  },

  importCsv: (csv: string) =>
    request<{ imported: number; errors: string[] }>("/csv/entries", {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: csv,
    }),

  recurring: () => request<RecurringItem[]>("/recurring"),
  createRecurring: (item: NewRecurring) =>
    request<RecurringItem>("/recurring", { method: "POST", body: JSON.stringify(item) }),
  updateRecurring: (id: number, item: NewRecurring) =>
    request<RecurringItem>(`/recurring/${id}`, { method: "PUT", body: JSON.stringify(item) }),
  recordRecurring: (id: number, amount: number) =>
    request<RecurringItem>(`/recurring/${id}/record`, {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),
  deleteRecurring: (id: number) => request<void>(`/recurring/${id}`, { method: "DELETE" }),

  templates: () => request<EntryTemplate[]>("/templates"),
  createTemplate: (template: {
    name: string;
    amount: number;
    vendorName?: string;
    categoryId?: number;
  }) => request<EntryTemplate>("/templates", { method: "POST", body: JSON.stringify(template) }),
  deleteTemplate: (id: number) => request<void>(`/templates/${id}`, { method: "DELETE" }),

  debts: () => request<Debt[]>("/debts"),
  createDebt: (debt: { name: string; startingAmount: number; kind: DebtKind }) =>
    request<Debt>("/debts", { method: "POST", body: JSON.stringify(debt) }),
  updateDebt: (id: number, debt: { name: string; startingAmount: number; kind: DebtKind }) =>
    request<Debt>(`/debts/${id}`, { method: "PUT", body: JSON.stringify(debt) }),
  payDebt: (id: number, amount: number) =>
    request<Debt>(`/debts/${id}/pay`, { method: "POST", body: JSON.stringify({ amount }) }),
  deleteDebt: (id: number) => request<void>(`/debts/${id}`, { method: "DELETE" }),

  goals: () => request<SavingsGoal[]>("/goals"),
  setAside: (month: string) =>
    request<{ month: string; amount: number }>(`/goals/set-aside/${month}`),
  createGoal: (goal: { name: string; targetAmount?: number | null; targetDate?: string | null }) =>
    request<SavingsGoal>("/goals", { method: "POST", body: JSON.stringify(goal) }),
  updateGoal: (
    id: number,
    goal: { name: string; targetAmount?: number | null; targetDate?: string | null },
  ) => request<SavingsGoal>(`/goals/${id}`, { method: "PUT", body: JSON.stringify(goal) }),
  contributeToGoal: (id: number, amount: number) =>
    request<SavingsGoal>(`/goals/${id}/contribute`, {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),
  deleteGoal: (id: number) => request<void>(`/goals/${id}`, { method: "DELETE" }),

  importProfiles: () => request<ImportProfile[]>("/import/profiles"),
  saveImportProfile: (name: string, mapping: string) =>
    request<ImportProfile>("/import/profiles", {
      method: "POST",
      body: JSON.stringify({ name, mapping }),
    }),
  deleteImportProfile: (id: number) =>
    request<void>(`/import/profiles/${id}`, { method: "DELETE" }),
  proposeImport: (rows: { date: string; amount: number; kind: EntryKind; description: string }[]) =>
    request<ProposeResult>("/import/propose", { method: "POST", body: JSON.stringify({ rows }) }),

  challenges: () => request<SpendingChallenge[]>("/challenges"),
  createChallenge: (challenge: {
    kind: ChallengeKind;
    target: number;
    categoryId?: number;
    month: string;
  }) => request<{ id: number }>("/challenges", { method: "POST", body: JSON.stringify(challenge) }),
  deleteChallenge: (id: number) => request<void>(`/challenges/${id}`, { method: "DELETE" }),
};

let formatter = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });

/** Point the shared formatter at the signed-in user's currency. */
export function setCurrency(code: string) {
  try {
    formatter = new Intl.NumberFormat(undefined, { style: "currency", currency: code });
  } catch {
    // Unknown code: keep the previous formatter.
  }
}

export const currency = { format: (n: number) => formatter.format(n) };

export function currentMonth(): string {
  return today().slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const shifted = new Date(year, mon - 1 + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return new Date(year, mon - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
