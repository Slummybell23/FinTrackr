export interface AuthUser {
  id: string;
  email: string;
  currency: string;
  isAdmin: boolean;
  rolloverBudgets: boolean;
  theme: string | null;
  monthlySavingsTarget: number;
  savingsRateTarget: number;
  overspendNudge: boolean;
  reflection: boolean;
  challenges: boolean;
}

/** A statement row proposed against the book — reviewed before anything lands. */
export interface ImportProposal {
  date: string;
  amount: number;
  kind: EntryKind;
  rawDescription: string;
  vendorName: string;
  categoryId: number | null;
  categoryName: string | null;
  matched: boolean;
  duplicate: boolean;
  include: boolean;
}

export interface ProposeResult {
  proposals: ImportProposal[];
  warnings: string[];
}

/** A bank's CSV shape, remembered; mapping is the client's own JSON. */
export interface ImportProfile {
  id: number;
  name: string;
  mapping: string;
}

export interface Category {
  id: number;
  name: string;
  emoji: string | null;
  monthlyBudget: number;
  sortOrder: number;
  group: string | null;
}

export interface Vendor {
  id: number;
  name: string;
  alias: string | null;
  defaultCategoryId: number | null;
}

export interface Entry {
  id: number;
  amount: number;
  date: string; // yyyy-MM-dd
  vendorName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  note: string | null;
  kind: EntryKind;
  hasReceipt: boolean;
  debtId: number | null;
  debtName: string | null;
  tags: string[];
  worth: "Worth" | "Regret" | null;
  vendorId: number | null;
  vendorAlias: string | null;
}

export type EntryKind = "Expense" | "Income";

export interface NewEntry {
  amount: number;
  date: string;
  vendorName?: string;
  categoryId?: number;
  note?: string;
  kind?: EntryKind;
  debtId?: number;
  tags?: string[];
}

export interface CategoryUpsert {
  name: string;
  emoji: string | null;
  monthlyBudget: number;
  sortOrder: number;
  group?: string | null;
}

export type Cadence = "Weekly" | "Monthly" | "Yearly";

export interface NewRecurring {
  name: string;
  amount: number;
  cadence: Cadence;
  nextDate: string;
  categoryId?: number;
  variable?: boolean;
}

export interface RecurringItem {
  id: number;
  name: string;
  amount: number;
  cadence: Cadence;
  nextDate: string;
  categoryId: number | null;
  previousAmount: number | null;
  amountChangedAt: string | null;
  variable: boolean;
}

export interface EntryTemplate {
  id: number;
  name: string;
  amount: number;
  vendorName: string | null;
  categoryId: number | null;
}

export type DebtKind = "ShortTerm" | "LongTerm";

export interface Debt {
  id: number;
  name: string;
  startingAmount: number;
  paidAmount: number;
  kind: DebtKind;
}

export interface SavingsGoal {
  id: number;
  name: string;
  /** Null for a plain savings category (a bucket with no goal to reach). */
  targetAmount: number | null;
  savedAmount: number;
  /** A sinking-fund deadline; null for an open-ended jar. */
  targetDate: string | null;
}

export type ChallengeKind = "NoSpendDays" | "CategoryUnder" | "TotalUnder";

export interface SpendingChallenge {
  id: number;
  kind: ChallengeKind;
  target: number;
  categoryId: number | null;
  categoryName: string | null;
  month: string;
  current: number;
  done: boolean;
}

export interface CategorySummary {
  categoryId: number;
  name: string;
  emoji: string | null;
  budget: number;
  spent: number;
  group: string | null;
}

export interface MonthSummary {
  month: string;
  budgetTotal: number;
  spent: number;
  income: number;
  carryOver: number;
  leftToSpend: number;
  entryCount: number;
  noSpendDays: number;
  categories: CategorySummary[];
}

export interface MonthTotal {
  month: string;
  spent: number;
  income: number;
}

export interface YearSummary {
  year: number;
  budgetTotal: number;
  months: MonthTotal[];
}

export interface WeekStats {
  spent: number;
  entryCount: number;
  noSpendDays: number;
}

export interface ReviewSummary {
  from: string;
  to: string;
  thisWeek: WeekStats;
  lastWeek: WeekStats;
  biggestEntry: Entry | null;
  topCategory: string | null;
}

export interface PatternSuggestion {
  vendorName: string;
  categoryId: number | null;
  count: number;
  averageAmount: number;
  intervalDays: number;
  suggestedCadence: Cadence;
}
