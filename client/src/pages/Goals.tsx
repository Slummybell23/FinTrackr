import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, currency, currentMonth } from "../lib/api";
import { haptic } from "../lib/haptics";
import { useUser } from "../lib/user";
import type { SavingsGoal } from "../lib/types";

/** Whole months from now until a target date (0 or less means it's here/past). */
function monthsUntil(iso: string): number {
  const target = new Date(`${iso}T00:00:00`);
  const now = new Date();
  return (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
}

function monthYear(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export default function Goals() {
  const user = useUser();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [setAside, setSetAside] = useState(0);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [byDate, setByDate] = useState("");

  useEffect(() => {
    api.goals().then(setGoals).catch(() => {});
    api.setAside(currentMonth()).then((r) => setSetAside(r.amount)).catch(() => {});
  }, []);

  const total = goals.reduce((sum, g) => sum + g.savedAmount, 0);
  const monthlyGoal = user?.monthlySavingsTarget ?? 0;
  const setAsideRatio = monthlyGoal > 0 ? Math.min(1, setAside / monthlyGoal) : 0;

  async function add() {
    if (!name.trim()) return;
    // A blank target makes a plain savings category; a number makes a jar.
    const targetAmount = target.trim() ? Number.parseFloat(target) : null;
    if (targetAmount !== null && (!Number.isFinite(targetAmount) || targetAmount <= 0)) return;
    const created = await api.createGoal({
      name: name.trim(),
      targetAmount,
      targetDate: byDate || null,
    });
    setGoals((all) => [...all, created]);
    setName("");
    setTarget("");
    setByDate("");
  }

  async function remove(goal: SavingsGoal) {
    if (!window.confirm(`Delete "${goal.name}"?`)) return;
    await api.deleteGoal(goal.id).catch(() => {});
    setGoals((all) => all.filter((g) => g.id !== goal.id));
  }

  const field = "field-sm";

  return (
    <div className="lg:max-w-xl">
      <header className="mb-8">
        <Link to="/budgets" className="text-sm text-ink-faint">
          ‹ Budgets
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-light">Savings</h1>
        <p className="text-sm text-ink-mute">
          Split what you've set aside into buckets: some with a goal to reach, some just a share.
        </p>
      </header>

      {goals.length > 0 && (
        <section className="mb-8">
          <p className="label-micro">Set aside, all told</p>
          <p className="mt-1 font-serif text-4xl font-light tracking-tight">
            {currency.format(total)}
          </p>
          <p className="mt-1 text-sm text-ink-mute">
            across {goals.length} {goals.length === 1 ? "bucket" : "buckets"}
          </p>
        </section>
      )}

      {monthlyGoal > 0 && (
        <section className="mb-8 card p-4">
          <p className="label-micro">Pay yourself first</p>
          <p className="mt-1 text-sm text-ink-mute">
            <span className="text-ink">{currency.format(setAside)}</span> set aside this month of
            your {currency.format(monthlyGoal)} goal
            {setAside >= monthlyGoal && ". Done for the month."}
          </p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-edge">
            <div
              className="h-1.5 rounded-full bg-accent"
              style={{ width: `${setAsideRatio * 100}%` }}
            />
          </div>
        </section>
      )}

      {goals.length === 0 && (
        <p className="py-6 text-center text-sm text-ink-faint">No buckets yet.</p>
      )}

      <ul className="space-y-8">
        {goals.map((goal) => (
          <GoalRow
            key={goal.id}
            goal={goal}
            total={total}
            onChange={(updated) =>
              setGoals((all) => all.map((g) => (g.id === updated.id ? updated : g)))
            }
            onDelete={() => remove(goal)}
          />
        ))}
      </ul>

      <div className="mt-10 border-t border-edge pt-6">
        <h2 className="mb-3 label-micro">New bucket</h2>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              className={`${field} min-w-0 flex-1`}
              placeholder="Emergency, Kyoto, new roof…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className={`${field} w-28 text-right`}
              inputMode="decimal"
              placeholder="Target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              aria-label="Target (optional)"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="flex flex-1 items-center gap-2 text-xs text-ink-faint">
              By
              <input
                className={`${field} flex-1`}
                type="date"
                value={byDate}
                onChange={(e) => setByDate(e.target.value)}
                aria-label="Target date (optional)"
              />
            </label>
            <button onClick={add} className="px-2 text-accent">
              Add
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          Leave the target blank for a plain category. Add a target and a date to make a sinking
          fund the app will pace for you.
        </p>
      </div>
    </div>
  );
}

function GoalRow({
  goal,
  total,
  onChange,
  onDelete,
}: {
  goal: SavingsGoal;
  total: number;
  onChange: (goal: SavingsGoal) => void;
  onDelete: () => void;
}) {
  const [amount, setAmount] = useState("");
  const hasTarget = goal.targetAmount !== null && goal.targetAmount > 0;
  const ratio = hasTarget
    ? Math.min(1, goal.savedAmount / goal.targetAmount!)
    : total > 0
      ? goal.savedAmount / total
      : 0;

  // Sinking fund: what to set aside each month to land the target on time.
  const remaining = hasTarget ? goal.targetAmount! - goal.savedAmount : 0;
  let pace: string | null = null;
  if (goal.targetDate && hasTarget && remaining > 0) {
    const months = monthsUntil(goal.targetDate);
    if (months <= 0) pace = `Due now to reach by ${monthYear(goal.targetDate)}.`;
    else pace = `≈ ${currency.format(remaining / months)} a month to reach by ${monthYear(goal.targetDate)}.`;
  } else if (goal.targetDate && hasTarget) {
    pace = `Reached, ahead of ${monthYear(goal.targetDate)}.`;
  }

  async function contribute(sign: 1 | -1) {
    const value = Number.parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    const updated = await api.contributeToGoal(goal.id, sign * value).catch(() => null);
    if (updated) {
      onChange(updated);
      setAmount("");
      haptic();
    }
  }

  return (
    <li>
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-sm">{goal.name}</p>
        <button onClick={onDelete} className="px-1 text-ink-faint" aria-label={`Delete ${goal.name}`}>
          ✕
        </button>
      </div>
      <p className="font-serif text-2xl font-light">
        {currency.format(goal.savedAmount)}
        {hasTarget ? (
          <span className="text-base text-ink-faint"> of {currency.format(goal.targetAmount!)}</span>
        ) : (
          total > 0 && (
            <span className="text-base text-ink-faint">
              {" "}
              · {Math.round(ratio * 100)}% of your savings
            </span>
          )
        )}
      </p>
      <div className="mt-2 h-1 w-full rounded-full bg-edge">
        <div className="h-1 rounded-full bg-accent" style={{ width: `${ratio * 100}%` }} />
      </div>
      {pace && <p className="mt-1 text-xs text-ink-faint">{pace}</p>}
      <div className="mt-3 flex items-center gap-2">
        <input
          className="field-sm w-28 text-right"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button onClick={() => contribute(1)} className="text-sm text-accent">
          Add
        </button>
        <button onClick={() => contribute(-1)} className="text-sm text-ink-faint">
          Take out
        </button>
      </div>
    </li>
  );
}
