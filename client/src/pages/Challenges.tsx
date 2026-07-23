import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, currency, currentMonth, monthLabel } from "../lib/api";
import type { Category, ChallengeKind, SpendingChallenge } from "../lib/types";

const kinds: { id: ChallengeKind; label: string; needsCategory: boolean; caps: boolean }[] = [
  { id: "NoSpendDays", label: "No-spend days", needsCategory: false, caps: false },
  { id: "CategoryUnder", label: "Keep a line under", needsCategory: true, caps: true },
  { id: "TotalUnder", label: "Keep the month under", needsCategory: false, caps: true },
];

export default function Challenges() {
  const [challenges, setChallenges] = useState<SpendingChallenge[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kind, setKind] = useState<ChallengeKind>("NoSpendDays");
  const [target, setTarget] = useState("");
  const [categoryId, setCategoryId] = useState("");

  useEffect(() => {
    api.challenges().then(setChallenges).catch(() => {});
    api.categories().then(setCategories).catch(() => {});
  }, []);

  async function add() {
    const value = Number.parseFloat(target);
    if (!Number.isFinite(value) || value <= 0) return;
    const meta = kinds.find((k) => k.id === kind)!;
    if (meta.needsCategory && !categoryId) return;
    await api
      .createChallenge({
        kind,
        target: value,
        categoryId: meta.needsCategory ? Number(categoryId) : undefined,
        month: currentMonth(),
      })
      .catch(() => {});
    api.challenges().then(setChallenges).catch(() => {});
    setTarget("");
  }

  async function remove(challenge: SpendingChallenge) {
    await api.deleteChallenge(challenge.id).catch(() => {});
    setChallenges((all) => all.filter((c) => c.id !== challenge.id));
  }

  const meta = kinds.find((k) => k.id === kind)!;
  const field = "field-sm";

  return (
    <div className="lg:max-w-xl">
      <header className="mb-8">
        <Link to="/budgets" className="text-sm text-ink-faint">
          ‹ Budgets
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-light">Challenges</h1>
        <p className="text-sm text-ink-mute">A goal for the month, with teeth.</p>
      </header>

      {challenges.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-faint">
          No challenges yet. Set one below.
        </p>
      ) : (
        <ul className="space-y-6">
          {challenges.map((challenge) => (
            <ChallengeRow key={challenge.id} challenge={challenge} onDelete={() => remove(challenge)} />
          ))}
        </ul>
      )}

      <div className="mt-10 border-t border-edge pt-6">
        <h2 className="mb-3 label-micro">New challenge · {monthLabel(currentMonth())}</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {kinds.map((option) => (
            <button
              key={option.id}
              onClick={() => setKind(option.id)}
              className={`chip py-1.5 ${
                kind === option.id ? "border-accent text-ink" : "border-edge text-ink-faint"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {meta.needsCategory && (
            <select
              className={`${field} min-w-0 flex-1`}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Line"
            >
              <option value="">Pick a line…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji ? `${c.emoji} ` : ""}
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <input
            className={`${field} w-28 text-right`}
            inputMode="decimal"
            placeholder={meta.caps ? "cap $" : "days"}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-label="Target"
          />
          <button onClick={add} className="px-2 text-accent">
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function ChallengeRow({
  challenge,
  onDelete,
}: {
  challenge: SpendingChallenge;
  onDelete: () => void;
}) {
  const caps = challenge.kind !== "NoSpendDays";
  const ratio = challenge.target > 0 ? Math.min(1, challenge.current / challenge.target) : 0;
  const over = caps && challenge.current > challenge.target;

  const title =
    challenge.kind === "NoSpendDays"
      ? `${challenge.target} no-spend days`
      : challenge.kind === "CategoryUnder"
        ? `${challenge.categoryName ?? "A line"} under ${currency.format(challenge.target)}`
        : `The month under ${currency.format(challenge.target)}`;

  const readout = caps
    ? `${currency.format(challenge.current)} of ${currency.format(challenge.target)}`
    : `${challenge.current} of ${challenge.target} days`;

  const status = caps
    ? over
      ? "over the cap"
      : challenge.done
        ? "holding"
        : "on track"
    : challenge.done
      ? "made it"
      : "in progress";

  return (
    <li>
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-sm">{title}</p>
        <button onClick={onDelete} className="px-1 text-ink-faint" aria-label="Delete challenge">
          ✕
        </button>
      </div>
      <p className="font-serif text-xl font-light">
        {readout}
        <span className={`ml-2 text-xs ${over ? "text-accent" : "text-ink-faint"}`}>· {status}</span>
      </p>
      <div className="mt-2 h-1.5 w-full rounded-full bg-edge">
        <div
          className={`h-1.5 rounded-full ${over ? "bg-accent" : "bg-ink-mute"}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </li>
  );
}
