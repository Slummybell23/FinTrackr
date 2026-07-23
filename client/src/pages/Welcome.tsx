import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, currency, today } from "../lib/api";
import type { Category, Entry } from "../lib/types";
import { CategoryManager } from "./Budgets";

const stepTitles = ["The idea", "Your lines", "First entry", "On its own", "Make it yours"];

/** First-run walkthrough: teaches the model, sets lines, writes a real first entry. */
export default function Welcome() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const last = step === stepTitles.length - 1;

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-[max(2rem,env(safe-area-inset-top))]">
      <header className="mb-6">
        <p className="label-micro">
          Welcome to FinTrackr · {step + 1} of {stepTitles.length}
        </p>
        <h1 className="mt-1 font-serif text-3xl font-light">{stepTitles[step]}</h1>
      </header>

      <div className="flex-1">
        {step === 0 && <TheIdea />}
        {step === 1 && <YourLines />}
        {step === 2 && <FirstEntry />}
        {step === 3 && <OnItsOwn />}
        {step === 4 && <MakeItYours />}
      </div>

      <footer className="mt-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-4 flex justify-center gap-2">
          {stepTitles.map((title, i) => (
            <button
              key={title}
              onClick={() => setStep(i)}
              aria-label={title}
              className={`h-1.5 w-6 rounded-full ${i === step ? "bg-accent" : "bg-edge"}`}
            />
          ))}
        </div>
        <div className="flex gap-3">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="btn-quiet px-5 py-3">
              Back
            </button>
          )}
          <button
            onClick={() => (last ? navigate("/") : setStep(step + 1))}
            className="btn-ink flex-1 py-3"
          >
            {last ? "Open your ledger" : "Next"}
          </button>
        </div>
        {!last && (
          <button
            onClick={() => navigate("/")}
            className="mt-3 w-full text-center text-sm text-ink-faint"
          >
            Skip the tour
          </button>
        )}
      </footer>
    </div>
  );
}

function TheIdea() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-ink-mute">
      <p>
        FinTrackr doesn't connect to a bank.{" "}
        <span className="text-ink">You write each purchase down by hand</span>, and that small
        ritual is the point: you always know where the month stands.
      </p>
      <p>
        Instead of a balance, you give each part of your life a <span className="text-ink">line
        with a monthly budget</span>: groceries, dining, transport.{" "}
        <span className="text-ink">Left to spend</span>, the big number on Home, is simply your
        lines added up, minus what you've written down this month.
      </p>
      <div className="card p-4">
        <p className="label-micro">Example</p>
        <p className="mt-2">
          Lines totaling <span className="font-serif text-ink">$800</span> − entries totaling{" "}
          <span className="font-serif text-ink">$125</span> ={" "}
          <span className="font-serif text-ink">$675</span> left to spend.
        </p>
      </div>
      <p>
        Income can be recorded too (it shows up in Insights), but it never changes Left to
        spend. Only your lines do.
      </p>
    </div>
  );
}

function YourLines() {
  const [total, setTotal] = useState<number | null>(null);
  const [stamp, setStamp] = useState(0);

  useEffect(() => {
    api
      .categories()
      .then((all: Category[]) => setTotal(all.reduce((sum, c) => sum + c.monthlyBudget, 0)))
      .catch(() => {});
  }, [stamp]);

  return (
    <div>
      <p className="mb-4 text-sm leading-relaxed text-ink-mute">
        We started you with six common lines. Rename them, change the budgets to match your
        month, add your own, or strike the ones you don't need. The ✕ removes a line, the
        arrows reorder. You can always return to these on the{" "}
        <span className="text-ink">Budgets</span> tab.
      </p>
      <CategoryManager onDone={() => setStamp((s) => s + 1)} />
      {total !== null && (
        <p className="mt-4 border-t border-edge pt-3 text-sm text-ink-mute">
          Your month starts with{" "}
          <span className="font-serif text-lg text-ink">{currency.format(total)}</span> left to
          spend.
        </p>
      )}
    </div>
  );
}

function FirstEntry() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [amount, setAmount] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [saved, setSaved] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.categories().then(setCategories).catch(() => {});
  }, []);

  async function save() {
    const parsed = Number.parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter an amount first.");
      return;
    }
    setError(null);
    try {
      const entry = await api.createEntry({
        amount: parsed,
        date: today(),
        vendorName: vendorName.trim() || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
      });
      setSaved(entry);
    } catch {
      setError("Couldn't save. Try again.");
    }
  }

  if (saved) {
    return (
      <div className="space-y-4 text-sm leading-relaxed text-ink-mute">
        <div className="card p-4">
          <p className="label-micro">In the book</p>
          <p className="mt-2 font-serif text-2xl text-ink">{currency.format(saved.amount)}</p>
          <p className="text-xs text-ink-faint">
            {saved.vendorName ?? "No vendor"} · {saved.categoryName ?? "Uncategorized"}
          </p>
        </div>
        {saved.vendorName && (
          <p>
            <span className="text-ink">Vendor memory</span> just learned something: the next
            time you type "{saved.vendorName}", the entry files itself into{" "}
            {saved.categoryName ?? "whatever category you teach it next"} on its own. Mark once,
            filed forever.
          </p>
        )}
        <p>
          Every entry lives on the <span className="text-ink">Activity</span> tab. Tap one to
          edit it, change its category, attach a receipt photo, or strike it from the book.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-ink-mute">
        Try it now: think of the last thing you bought. The{" "}
        <span className="text-ink">+ New entry</span> button on Home is this same form. Pick a
        category, or leave it on Auto and let vendor memory learn it.
      </p>
      <input
        className="field font-serif text-3xl"
        inputMode="decimal"
        placeholder="0.00"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <input
        className="field"
        placeholder="Vendor: Blue Bottle, the corner store…"
        value={vendorName}
        onChange={(e) => setVendorName(e.target.value)}
      />
      <select className="field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">Auto (vendor memory decides)</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.emoji ? `${c.emoji} ` : ""}
            {c.name}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-accent">{error}</p>}
      <button onClick={save} className="btn-ink w-full py-3">
        Write it down
      </button>
    </div>
  );
}

function OnItsOwn() {
  const items = [
    ["Recurring", "Rent, subscriptions, the gym: add them once under Budgets → Recurring and they post themselves to the ledger when due."],
    ["Patterns", "FinTrackr notices same-vendor, steady-amount purchases and offers to make them recurring. Suggestions appear on Insights."],
    ["Weekly review", "A Sunday recap on Insights: this week against last, your biggest entry, your top line."],
    ["Rhythm", "The Insights calendar marks no-spend days. Open squares are quiet days, and streaks feel good."],
    ["Closing the book", "Step back a month on Budgets and it reads you the recap: which lines held, which ran over."],
  ] as const;

  return (
    <div className="space-y-3">
      <p className="mb-4 text-sm leading-relaxed text-ink-mute">
        You keep the book; FinTrackr reads it. A few things happen without you:
      </p>
      {items.map(([title, body]) => (
        <div key={title} className="card p-4">
          <p className="label-micro">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-mute">{body}</p>
        </div>
      ))}
    </div>
  );
}

function MakeItYours() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-ink-mute">
      <p>
        On the <span className="text-ink">You</span> tab, pick your paper (six light, four
        dark, or follow the system with a different sheet for day and night) and an accent
        ink, named or mixed yourself. Your look follows your account onto every device, and
        the ledger exports as CSV any time.
      </p>
      <p>
        <span className="text-ink">Install it.</span> Add FinTrackr to your home screen (Share →
        Add to Home Screen on iPhone, Install on Android/desktop) and it opens like a native
        app. Entries written offline queue up and post themselves when you're back.
      </p>
      <p>
        <span className="text-ink">Savings goals</span> are jars you fill by hand. Find them
        under Budgets, next to Recurring and the long view of your year.
      </p>
      <p className="border-t border-edge pt-4 font-serif text-lg text-ink">
        That's the whole practice: write it down, read the month, close the book.
      </p>
    </div>
  );
}
