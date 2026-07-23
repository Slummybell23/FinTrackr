import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, currency, currentMonth, today } from "../lib/api";
import { haptic } from "../lib/haptics";
import { useUser } from "../lib/user";
import type { Category, Debt, EntryKind, Vendor } from "../lib/types";

/** What the ledger remembers about a vendor's usual amount. */
interface VendorStats {
  count: number;
  average: number;
  steady: boolean;
}

/** Creates at /new, edits at /entries/:id. */
export default function NewEntry() {
  const navigate = useNavigate();
  const user = useUser();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const editingId = id ? Number(id) : null;

  const [categories, setCategories] = useState<Category[]>([]);
  const [amount, setAmount] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [date, setDate] = useState(today());
  // Text shared into the PWA (share target) lands in the note.
  const [note, setNote] = useState(searchParams.get("text") ?? "");
  const [kind, setKind] = useState<EntryKind>("Expense");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasReceipt, setHasReceipt] = useState(false);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [debtId, setDebtId] = useState("");
  const [keepAsQuickAdd, setKeepAsQuickAdd] = useState(false);
  const [receiptStamp, setReceiptStamp] = useState(0);
  const [tagsText, setTagsText] = useState("");
  // Where each line stands this month, to warn before a new entry pushes it over.
  const [lineStatus, setLineStatus] = useState<
    Map<number, { spent: number; budget: number; name: string }>
  >(new Map());
  const [vendorStats, setVendorStats] = useState<VendorStats | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  // The amount as the fetch callback will see it, and what we last prefilled —
  // a prefill only ever lands on an empty field or replaces its own value.
  const amountRef = useRef(amount);
  amountRef.current = amount;
  const prefillRef = useRef<string | null>(null);

  useEffect(() => {
    api.categories().then(setCategories).catch(() => {});
    api.debts().then(setDebts).catch(() => {});
    api.vendors().then(setVendors).catch(() => {});
    // Only new entries get the overspend nudge (an edit is already counted).
    if (!editingId && user?.overspendNudge) {
      api
        .monthSummary(currentMonth())
        .then((s) =>
          setLineStatus(
            new Map(
              s.categories.map((c) => [c.categoryId, { spent: c.spent, budget: c.budget, name: c.name }]),
            ),
          ),
        )
        .catch(() => {});
    }
    if (editingId) {
      api
        .entry(editingId)
        .then((entry) => {
          setAmount(String(entry.amount));
          setVendorName(entry.vendorName ?? "");
          setCategoryId(entry.categoryId ? String(entry.categoryId) : "");
          setDate(entry.date);
          setNote(entry.note ?? "");
          setKind(entry.kind);
          setHasReceipt(entry.hasReceipt);
          setDebtId(entry.debtId ? String(entry.debtId) : "");
          setTagsText(entry.tags.join(", "));
        })
        .catch(() => setError("Couldn't load that entry."));
    }
  }, [editingId]);

  // Vendor amount memory: the ledger knows what a vendor usually costs.
  useEffect(() => {
    const name = vendorName.trim().toLowerCase();
    if (!name || kind !== "Expense") {
      setVendorStats(null);
      return;
    }
    const timer = setTimeout(() => {
      api
        .entries({ search: vendorName.trim(), kind: "Expense", limit: 50 })
        .then((found) => {
          const past = found.filter(
            (e) => e.vendorName?.toLowerCase() === name && e.id !== editingId,
          );
          // A prefill only ever sits on an untouched field; when this vendor
          // can't back one, a leftover prefill from the last vendor is cleared.
          const untouched =
            amountRef.current === "" || amountRef.current === prefillRef.current;
          const canPrefill = past.length >= 3;
          const average = canPrefill
            ? past.reduce((sum, e) => sum + e.amount, 0) / past.length
            : 0;
          const steady =
            canPrefill && past.every((e) => Math.abs(e.amount - average) <= average * 0.25);

          setVendorStats(canPrefill ? { count: past.length, average, steady } : null);
          if (editingId || !untouched) return;
          if (steady) {
            const value = average.toFixed(2);
            prefillRef.current = value;
            setAmount(value);
          } else if (prefillRef.current !== null) {
            prefillRef.current = null;
            setAmount("");
          }
        })
        .catch(() => setVendorStats(null));
    }, 400);
    return () => clearTimeout(timer);
  }, [vendorName, kind, editingId]);

  // Vendor search: typing reads the vendor book; picking fills the field.
  // A name the book doesn't hold becomes a new vendor when the entry saves.
  const vendorQuery = vendorName.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!vendorQuery) return [];
    const hit = (text: string | null) => text?.toLowerCase().includes(vendorQuery) ?? false;
    const leads = (v: Vendor) =>
      v.name.toLowerCase().startsWith(vendorQuery) ||
      (v.alias?.toLowerCase().startsWith(vendorQuery) ?? false);
    return vendors
      .filter((v) => hit(v.name) || hit(v.alias))
      .sort((a, b) => Number(leads(b)) - Number(leads(a)) || a.name.localeCompare(b.name))
      .slice(0, 6);
  }, [vendors, vendorQuery]);

  const knownVendor = vendors.some(
    (v) => v.name.toLowerCase() === vendorQuery || v.alias?.toLowerCase() === vendorQuery,
  );
  // The lone suggestion that just echoes the field back isn't worth a menu.
  const menuOpen =
    suggestOpen &&
    suggestions.length > 0 &&
    !(suggestions.length === 1 && suggestions[0].name.toLowerCase() === vendorQuery);

  function pickVendor(vendor: Vendor) {
    setVendorName(vendor.name);
    setSuggestOpen(false);
    setActiveSuggestion(-1);
  }

  function vendorKeys(e: KeyboardEvent<HTMLInputElement>) {
    if (!menuOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestion((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestion((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeSuggestion >= 0) {
      e.preventDefault();
      pickVendor(suggestions[activeSuggestion]);
    } else if (e.key === "Escape") {
      setSuggestOpen(false);
      setActiveSuggestion(-1);
    }
  }

  const categoryLabel = (id: number | null) => {
    const category = categories.find((c) => c.id === id);
    return category ? `${category.emoji ? `${category.emoji} ` : ""}${category.name}` : null;
  };

  const parsedAmount = Number.parseFloat(amount);

  // A gentle heads-up: would this entry push its line over the month's budget?
  const overspend = (() => {
    if (editingId || kind !== "Expense" || !categoryId) return null;
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return null;
    const info = lineStatus.get(Number(categoryId));
    if (!info || info.budget <= 0) return null;
    const after = info.spent + parsedAmount;
    return after > info.budget ? { name: info.name, over: after - info.budget } : null;
  })();

  const unusual =
    vendorStats !== null &&
    kind === "Expense" &&
    Number.isFinite(parsedAmount) &&
    vendorStats.average > 0 &&
    parsedAmount >= vendorStats.average * 3 &&
    parsedAmount - vendorStats.average > 20;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = Number.parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter an amount.");
      return;
    }
    setSaving(true);
    setError(null);
    const tags = tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const payload = {
      amount: parsed,
      date,
      vendorName: vendorName.trim() || undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      note: note.trim() || undefined,
      kind,
      debtId: debtId ? Number(debtId) : undefined,
      tags: tags.length ? tags : undefined,
    };
    try {
      if (editingId) await api.updateEntry(editingId, payload);
      else await api.createEntry(payload);
      if (!editingId && keepAsQuickAdd) {
        await api
          .createTemplate({
            name: vendorName.trim() || note.trim() || "Quick add",
            amount: parsed,
            vendorName: vendorName.trim() || undefined,
            categoryId: categoryId ? Number(categoryId) : undefined,
          })
          .catch(() => {});
      }
      haptic();
      navigate(-1);
    } catch {
      if (!navigator.onLine && !editingId) {
        // The service worker queued the POST; it posts itself when back online.
        navigate("/", { state: { queued: true } });
        return;
      }
      setError("Couldn't save. Are you offline?");
      setSaving(false);
    }
  }

  async function remove() {
    if (!editingId || !window.confirm("Strike this entry from the ledger?")) return;
    await api.deleteEntry(editingId).catch(() => {});
    navigate(-1);
  }

  const field = "field";

  return (
    <div className="lg:max-w-xl">
      <header className="mb-8">
        <h1 className="font-serif text-2xl font-light">
          {editingId ? "Edit entry" : "New entry"}
        </h1>
        <p className="text-sm text-ink-mute">
          Leave the category blank and a known vendor files it for you.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-5">
        <div className="flex gap-2">
          {(["Expense", "Income"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setKind(option)}
              className={`chip py-1.5 ${
                kind === option ? "border-accent text-ink" : "border-edge text-ink-faint"
              }`}
            >
              {option === "Expense" ? "Spent" : "Came in"}
            </button>
          ))}
        </div>
        {kind === "Income" && (
          <p className="text-xs text-ink-faint">
            Income is kept in the ledger and shown in Insights. It doesn't raise Left to spend;
            that comes from your budget lines on the Budgets tab.
          </p>
        )}

        <label className="block">
          <span className="mb-1 block label-micro">
            Amount
          </span>
          <input
            className={`${field} font-serif text-3xl`}
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus={!editingId}
          />
          {unusual && vendorStats ? (
            <span className="mt-1 block text-xs text-accent">
              That's about {Math.round(parsedAmount / vendorStats.average)}× your usual at{" "}
              {vendorName.trim()}. Just checking.
            </span>
          ) : vendorStats ? (
            <span className="mt-1 block text-xs text-ink-faint">
              Usually about {currency.format(vendorStats.average)} at {vendorName.trim()}
              {prefillRef.current === amount && amount !== ""
                ? ", prefilled. Change it if today ran different."
                : "."}
            </span>
          ) : null}
        </label>

        <label className="relative block">
          <span className="mb-1 block label-micro">
            Vendor
          </span>
          <input
            className={field}
            placeholder="Blue Bottle"
            value={vendorName}
            onChange={(e) => {
              setVendorName(e.target.value);
              setSuggestOpen(true);
              setActiveSuggestion(-1);
            }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => {
              setSuggestOpen(false);
              setActiveSuggestion(-1);
            }}
            onKeyDown={vendorKeys}
            role="combobox"
            aria-expanded={menuOpen}
            aria-autocomplete="list"
            aria-controls="vendor-suggestions"
          />
          {menuOpen && (
            <ul
              id="vendor-suggestions"
              role="listbox"
              className="absolute inset-x-0 top-full z-10 mt-1 card divide-y divide-edge overflow-hidden"
              // Keep focus in the field so a tap registers before the blur closes the menu.
              onPointerDown={(e) => e.preventDefault()}
            >
              {suggestions.map((vendor, i) => {
                const viaAlias =
                  !vendor.name.toLowerCase().includes(vendorQuery) &&
                  (vendor.alias?.toLowerCase().includes(vendorQuery) ?? false);
                const files = categoryLabel(vendor.defaultCategoryId);
                return (
                  <li key={vendor.id} role="option" aria-selected={i === activeSuggestion}>
                    <button
                      type="button"
                      onClick={() => pickVendor(vendor)}
                      className={`flex w-full items-baseline justify-between gap-3 px-3 py-2.5 text-left text-sm ${
                        i === activeSuggestion ? "bg-edge/40" : ""
                      }`}
                    >
                      <span>{vendor.name}</span>
                      <span className="truncate text-xs text-ink-faint">
                        {viaAlias
                          ? `answers to ${vendor.alias}`
                          : files
                            ? `files under ${files}`
                            : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {vendorQuery && !knownVendor && !menuOpen && (
            <span className="mt-1 block text-xs text-ink-faint">
              A new vendor. The ledger will remember it when you save.
            </span>
          )}
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block min-w-0">
            <span className="mb-1 block label-micro">
              Category
            </span>
            <select
              className={`${field} min-w-0`}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Auto</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji ? `${c.emoji} ` : ""}
                  {c.name}
                </option>
              ))}
            </select>
            {overspend && (
              <span className="mt-1 block text-xs text-accent">
                This puts {overspend.name} {currency.format(overspend.over)} over its line.
              </span>
            )}
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block label-micro">
              Date
            </span>
            <input
              className={`${field} min-w-0`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>

        {debts.length > 0 && kind === "Expense" && (
          <label className="block">
            <span className="mb-1 block label-micro">
              Pays down
            </span>
            <select className={field} value={debtId} onChange={(e) => setDebtId(e.target.value)}>
              <option value="">Nothing, just spending</option>
              {debts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.startingAmount - d.paidAmount > 0 ? "owing" : "paid off"})
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="mb-1 block label-micro">
            Note
          </span>
          <input
            className={field}
            placeholder="Optional"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block label-micro">Tags</span>
          <input
            className={field}
            placeholder="kyoto-trip, gift (comma-separated)"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
          />
          <span className="mt-1 block text-xs text-ink-faint">
            Free-form labels that cut across categories.
          </span>
        </label>

        {editingId && (
          <div>
            <span className="mb-1 block label-micro">
              Receipt
            </span>
            {hasReceipt ? (
              <div>
                <img
                  src={`/api/entries/${editingId}/receipt?v=${receiptStamp}`}
                  alt="Receipt"
                  className="max-h-64 rounded-lg border border-edge"
                />
                <button
                  type="button"
                  onClick={async () => {
                    await api.deleteReceipt(editingId).catch(() => {});
                    setHasReceipt(false);
                  }}
                  className="mt-2 text-sm text-ink-faint"
                >
                  Remove receipt
                </button>
              </div>
            ) : (
              <label className="block cursor-pointer rounded-lg border border-dashed border-edge px-3 py-4 text-center text-sm text-ink-faint">
                Attach a photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      await api.uploadReceipt(editingId, file);
                      setHasReceipt(true);
                      setReceiptStamp(Date.now());
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Upload failed.");
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        )}

        {!editingId && (
          <label className="flex items-center gap-2 text-sm text-ink-mute">
            <input
              type="checkbox"
              checked={keepAsQuickAdd}
              onChange={(e) => setKeepAsQuickAdd(e.target.checked)}
            />
            Keep as a quick-add on Home
          </label>
        )}

        {error && <p className="text-sm text-accent">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="btn-ink flex-1 py-3"
          >
            {saving ? "Saving…" : editingId ? "Save changes" : "Add to ledger"}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-quiet px-5 py-3"
          >
            Cancel
          </button>
        </div>

        {editingId && (
          <button type="button" onClick={remove} className="w-full py-2 text-sm text-ink-faint">
            Strike from the ledger
          </button>
        )}
      </form>
    </div>
  );
}
