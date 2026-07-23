import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, currency } from "../lib/api";
import { buildRows, parseDelimited, sniffMapping, type CsvMapping } from "../lib/csv";
import { haptic } from "../lib/haptics";
import type { Category, ImportProfile, ImportProposal } from "../lib/types";

type Stage = "pick" | "map" | "review" | "writing" | "done";

/**
 * A bank statement, the deterministic way: any CSV in, columns mapped once
 * (and remembered as a bank profile), rows read against the book, and a
 * review before a single entry lands.
 */
export default function ImportCsv() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("pick");
  const [error, setError] = useState<string | null>(null);

  const [table, setTable] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [profiles, setProfiles] = useState<ImportProfile[]>([]);
  const [profileName, setProfileName] = useState("");
  const [pasted, setPasted] = useState("");

  const [proposals, setProposals] = useState<ImportProposal[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [written, setWritten] = useState(0);

  function begin(text: string) {
    setError(null);
    const rows = parseDelimited(text);
    if (rows.length < 2) {
      setError("That doesn't look like a statement. It needs at least a couple of rows.");
      return;
    }
    setTable(rows);
    setMapping(sniffMapping(rows));
    api.importProfiles().then(setProfiles).catch(() => {});
    setStage("map");
  }

  function applyProfile(profile: ImportProfile) {
    try {
      const saved = JSON.parse(profile.mapping) as CsvMapping;
      setMapping(saved);
      setProfileName(profile.name);
    } catch {
      setError("That profile couldn't be read.");
    }
  }

  const preview = mapping ? buildRows(table, mapping) : null;

  async function toReview() {
    if (!mapping || !preview || preview.rows.length === 0) return;
    setError(null);
    setStage("writing");
    try {
      if (profileName.trim())
        await api.saveImportProfile(profileName.trim(), JSON.stringify(mapping)).catch(() => {});
      const [result, cats] = await Promise.all([
        api.proposeImport(preview.rows),
        api.categories(),
      ]);
      setProposals(result.proposals);
      setWarnings([
        ...(preview.skipped > 0 ? [`${preview.skipped} rows didn't parse and were left out.`] : []),
        ...result.warnings,
      ]);
      setCategories(cats);
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The rows couldn't be read.");
      setStage("map");
    }
  }

  function patch(index: number, changes: Partial<ImportProposal>) {
    setProposals((all) => all.map((p, i) => (i === index ? { ...p, ...changes } : p)));
  }

  const keeping = proposals.filter((p) => p.include);

  async function confirm() {
    setStage("writing");
    let count = 0;
    for (const p of keeping) {
      const ok = await api
        .createEntry({
          amount: p.amount,
          date: p.date,
          vendorName: p.vendorName.trim() || undefined,
          categoryId: p.categoryId ?? undefined,
          kind: p.kind,
        })
        .then(() => true)
        .catch(() => false);
      if (ok) count++;
    }

    // Teach the vendor book: a cleaned-up name remembers the statement's raw
    // string as its alias, so the next import files it without asking.
    try {
      const vendors = await api.vendors();
      const taught = new Set<number>();
      for (const p of keeping) {
        const raw = p.rawDescription.trim();
        const name = p.vendorName.trim();
        if (p.matched || !name || raw.toLowerCase() === name.toLowerCase()) continue;
        const vendor = vendors.find((v) => v.name.toLowerCase() === name.toLowerCase());
        if (!vendor || vendor.alias || taught.has(vendor.id)) continue;
        taught.add(vendor.id);
        await api
          .updateVendor(vendor.id, {
            name: vendor.name,
            alias: raw.slice(0, 100),
            defaultCategoryId: vendor.defaultCategoryId,
          })
          .catch(() => {});
      }
    } catch {
      // Alias-teaching is a nicety; the entries are already in.
    }

    setWritten(count);
    haptic();
    setStage("done");
  }

  const field = "field-sm";
  const columnCount = Math.max(...table.slice(0, 5).map((r) => r.length), 1);
  const columnName = (col: number) =>
    mapping?.hasHeader && table[0]?.[col] ? `${col + 1}: ${table[0][col]}` : `column ${col + 1}`;

  return (
    <div className="lg:max-w-2xl">
      <header className="mb-8">
        <Link to="/you" className="text-sm text-ink-faint">
          ‹ You
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-light">Import from your bank</h1>
        <p className="text-sm text-ink-mute">
          The CSV your bank exports: mapped once, remembered, and reviewed before anything lands.
        </p>
      </header>

      {stage === "pick" && (
        <>
          <label className="block cursor-pointer rounded-lg border border-dashed border-edge px-4 py-10 text-center text-sm text-ink-faint">
            Choose a CSV from your bank
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.tsv,.txt,text/csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) begin(await file.text());
                e.target.value = "";
              }}
            />
          </label>
          <p className="my-4 text-center label-micro">or</p>
          <textarea
            className="field h-28"
            placeholder="Paste rows copied from your bank's website…"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          {pasted.trim() && (
            <button onClick={() => begin(pasted)} className="mt-2 text-sm text-accent">
              Read what's pasted ›
            </button>
          )}
          {error && <p className="mt-4 text-sm text-accent">{error}</p>}
        </>
      )}

      {stage === "map" && mapping && (
        <>
          {profiles.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyProfile(p)}
                  className={`chip py-1.5 ${
                    profileName === p.name ? "border-accent text-ink" : "border-edge text-ink-faint"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          <div className="mb-4 overflow-x-auto rounded-lg border border-edge">
            <table className="w-full text-xs">
              <tbody>
                {table.slice(0, 5).map((row, i) => (
                  <tr key={i} className={`divide-x divide-edge ${i === 0 && mapping.hasHeader ? "text-ink-faint" : ""}`}>
                    {Array.from({ length: columnCount }, (_, col) => (
                      <td key={col} className="max-w-40 truncate px-2 py-1.5">
                        {row[col] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Dates are in</span>
              <select
                className={`${field} min-w-0`}
                value={mapping.dateCol}
                onChange={(e) => setMapping({ ...mapping, dateCol: Number(e.target.value) })}
              >
                {Array.from({ length: columnCount }, (_, col) => (
                  <option key={col} value={col}>
                    {columnName(col)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Descriptions are in</span>
              <select
                className={`${field} min-w-0`}
                value={mapping.descCol}
                onChange={(e) => setMapping({ ...mapping, descCol: Number(e.target.value) })}
              >
                {Array.from({ length: columnCount }, (_, col) => (
                  <option key={col} value={col}>
                    {columnName(col)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Amounts</span>
              <select
                className={`${field} min-w-0`}
                value={mapping.amountMode}
                onChange={(e) =>
                  setMapping({ ...mapping, amountMode: e.target.value as CsvMapping["amountMode"] })
                }
              >
                <option value="signed-neg-spend">one column, negative is spending</option>
                <option value="signed-neg-income">one column, negative is income</option>
                <option value="all-spend">one column, everything is spending</option>
                <option value="debit-credit">two columns, debit and credit</option>
              </select>
            </label>
            {mapping.amountMode === "debit-credit" ? (
              <>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Debits (money out) in</span>
                  <select
                    className={`${field} min-w-0`}
                    value={mapping.debitCol}
                    onChange={(e) => setMapping({ ...mapping, debitCol: Number(e.target.value) })}
                  >
                    {Array.from({ length: columnCount }, (_, col) => (
                      <option key={col} value={col}>
                        {columnName(col)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Credits (money in) in</span>
                  <select
                    className={`${field} min-w-0`}
                    value={mapping.creditCol}
                    onChange={(e) => setMapping({ ...mapping, creditCol: Number(e.target.value) })}
                  >
                    {Array.from({ length: columnCount }, (_, col) => (
                      <option key={col} value={col}>
                        {columnName(col)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Amounts are in</span>
                <select
                  className={`${field} min-w-0`}
                  value={mapping.amountCol}
                  onChange={(e) => setMapping({ ...mapping, amountCol: Number(e.target.value) })}
                >
                  {Array.from({ length: columnCount }, (_, col) => (
                    <option key={col} value={col}>
                      {columnName(col)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Date order</span>
              <select
                className={`${field} min-w-0`}
                value={mapping.dateFormat}
                onChange={(e) =>
                  setMapping({ ...mapping, dateFormat: e.target.value as CsvMapping["dateFormat"] })
                }
              >
                <option value="auto">work it out</option>
                <option value="mdy">month / day / year</option>
                <option value="dmy">day / month / year</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>First row is a header</span>
              <button
                type="button"
                role="switch"
                aria-checked={mapping.hasHeader}
                onClick={() => setMapping({ ...mapping, hasHeader: !mapping.hasHeader })}
                className={`chip py-1 ${mapping.hasHeader ? "border-accent text-ink" : "border-edge text-ink-faint"}`}
              >
                {mapping.hasHeader ? "Yes" : "No"}
              </button>
            </label>
          </div>

          <div className="mt-6 border-t border-edge pt-4">
            <p className="mb-3 text-sm text-ink-mute">
              {preview && preview.rows.length > 0 ? (
                <>
                  Reads as <span className="text-ink">{preview.rows.length}</span>{" "}
                  {preview.rows.length === 1 ? "transaction" : "transactions"}
                  {preview.skipped > 0 && (
                    <span className="text-ink-faint">
                      {" "}
                      · {preview.skipped} {preview.skipped === 1 ? "row doesn't" : "rows don't"} parse
                    </span>
                  )}
                </>
              ) : (
                "Nothing parses yet. Check the columns above."
              )}
            </p>
            <input
              className={`${field} mb-3 w-full`}
              placeholder="Remember this bank as… (e.g. Chase Checking)"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              aria-label="Profile name"
            />
            <button
              onClick={toReview}
              disabled={!preview || preview.rows.length === 0}
              className="btn-ink w-full py-3"
            >
              Read against the book ›
            </button>
            {error && <p className="mt-3 text-sm text-accent">{error}</p>}
          </div>
        </>
      )}

      {stage === "writing" && (
        <div className="mt-6 animate-pulse space-y-3.5" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="h-4 flex-1 rounded bg-edge/50" />
              <div className="h-4 w-16 rounded bg-edge/50" />
            </div>
          ))}
        </div>
      )}

      {stage === "review" && (
        <>
          {warnings.length > 0 && (
            <ul className="mb-4 space-y-1 text-xs text-ink-faint">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          <ul className="divide-y divide-edge">
            {proposals.map((p, i) => (
              <li key={i} className={`py-4 ${p.include ? "" : "opacity-45"}`}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={p.include}
                    onChange={(e) => patch(i, { include: e.target.checked })}
                    className="mt-1.5 shrink-0"
                    aria-label={`Include ${p.vendorName}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <input
                        className="field-sm min-w-0 flex-1"
                        value={p.vendorName}
                        onChange={(e) => patch(i, { vendorName: e.target.value })}
                        aria-label="Vendor"
                      />
                      <p className={`shrink-0 font-serif text-lg ${p.kind === "Income" ? "text-accent" : ""}`}>
                        {p.kind === "Income" ? "+" : ""}
                        {currency.format(p.amount)}
                      </p>
                    </div>
                    <p className="mt-1 truncate text-xs text-ink-faint">
                      {new Date(`${p.date}T00:00:00`).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      · {p.rawDescription}
                    </p>
                    {p.kind === "Expense" && (
                      <select
                        className="field-sm mt-2 w-full"
                        value={p.categoryId ?? ""}
                        onChange={(e) =>
                          patch(i, { categoryId: e.target.value ? Number(e.target.value) : null })
                        }
                        aria-label="Files under"
                      >
                        <option value="">No line (uncategorized)</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            Files under {c.emoji ? `${c.emoji} ` : ""}
                            {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {p.duplicate && (
                      <p className="mt-1 text-xs text-ink-faint">
                        Looks already kept: same day, same amount.
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 border-t border-edge pt-4">
            <button
              onClick={confirm}
              disabled={keeping.length === 0}
              className="btn-ink w-full py-3"
            >
              Add {keeping.length} {keeping.length === 1 ? "entry" : "entries"} to the ledger
            </button>
          </div>
        </>
      )}

      {stage === "done" && (
        <section>
          <p className="font-serif text-3xl font-light">
            {written} {written === 1 ? "entry" : "entries"} written.
          </p>
          <p className="mt-2 text-sm text-ink-mute">
            Filed to their days, vendors remembered for next time.
          </p>
          <Link to="/activity" className="mt-4 inline-block text-sm text-accent">
            Read them in the ledger ›
          </Link>
        </section>
      )}
    </div>
  );
}
