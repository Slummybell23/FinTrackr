import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, auth, setCurrency } from "../lib/api";
import {
  getCustomAccent,
  getDayPaper,
  getInk,
  getNightPaper,
  getPaper,
  inks,
  papers,
  setCustomAccent,
  setDayPaper,
  setInk,
  setNightPaper,
  setPaper,
  themeMatches,
  themeSnapshot,
} from "../lib/theme";
import type { Ink, Paper } from "../lib/theme";
import type { AuthUser } from "../lib/types";

const currencies = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "SEK", "NZD"];

interface YouProps {
  user: AuthUser;
  onSignOut: () => void;
  onUserChange: (user: AuthUser) => void;
}

export default function You({ user, onSignOut, onUserChange }: YouProps) {
  const [paper, setPaperState] = useState<Paper>(getPaper());
  const [ink, setInkState] = useState<Ink>(getInk());
  const [dayPaper, setDayState] = useState<Paper>(getDayPaper());
  const [nightPaper, setNightState] = useState<Paper>(getNightPaper());
  const [customAccent, setCustomState] = useState(getCustomAccent());
  const customInput = useRef<HTMLInputElement>(null);

  const pushTimer = useRef<number | null>(null);

  /** Debounced: a drag through the color picker becomes one save, not dozens. */
  function pushTheme() {
    if (pushTimer.current !== null) window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => {
      auth.updateSettings({ theme: themeSnapshot() }).catch(() => {});
    }, 600);
  }
  const [signingOut, setSigningOut] = useState(false);
  const [currencyCode, setCurrencyCode] = useState(user.currency);
  const [passwords, setPasswords] = useState({ current: "", next: "" });
  const [securityNote, setSecurityNote] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const restoreInput = useRef<HTMLInputElement>(null);
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [rollover, setRollover] = useState(user.rolloverBudgets);

  async function chooseRollover(next: boolean) {
    setRollover(next);
    await auth.updateSettings({ rolloverBudgets: next }).catch(() => {});
  }

  const [savingsTarget, setSavingsTarget] = useState(
    user.monthlySavingsTarget ? String(user.monthlySavingsTarget) : "",
  );
  const [rateTarget, setRateTarget] = useState(
    user.savingsRateTarget ? String(user.savingsRateTarget) : "",
  );
  const [overspendNudge, setOverspendNudge] = useState(user.overspendNudge);
  const [reflection, setReflection] = useState(user.reflection);
  const [challengesOn, setChallengesOn] = useState(user.challenges);

  async function patchSettings(patch: Parameters<typeof auth.updateSettings>[0]) {
    const updated = await auth.updateSettings(patch).catch(() => null);
    if (updated) onUserChange(updated);
  }


  useEffect(() => {
    api.serverVersion().then(setServerVersion).catch(() => {});
    // Catch up the account if a past change never reached it (e.g. made offline).
    if (!themeMatches(user.theme)) pushTheme();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function chooseCurrency(code: string) {
    setCurrencyCode(code);
    await auth.updateSettings({ currency: code }).catch(() => {});
    setCurrency(code);
  }

  async function changePassword() {
    setSecurityNote(null);
    try {
      await auth.changePassword(passwords.current, passwords.next);
      setPasswords({ current: "", next: "" });
      setSecurityNote("Password changed.");
    } catch (e) {
      setSecurityNote(e instanceof Error ? e.message : "Couldn't change the password.");
    }
  }

  async function importCsv(file: File) {
    const text = await file.text();
    try {
      const result = await api.importCsv(text);
      window.alert(
        `Imported ${result.imported} entries.` +
          (result.errors.length ? `\nSkipped:\n${result.errors.slice(0, 5).join("\n")}` : ""),
      );
    } catch {
      window.alert("Import failed. Is the first line the header row?");
    }
  }

  async function deleteAccount() {
    const password = window.prompt(
      "This deletes your account and every entry, permanently. Enter your password to confirm.",
    );
    if (!password) return;
    try {
      await auth.deleteAccount(password);
      onSignOut();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Couldn't delete the account.");
    }
  }

  async function freshStart() {
    const password = window.prompt(
      "A fresh book: every entry, vendor, jar, and debt is struck permanently, and the starter lines return. Your account, password, and theme stay. Enter your password to confirm.",
    );
    if (!password) return;
    try {
      await auth.freshStart(password);
      // Land on Home, which greets a blank ledger with "A fresh book."
      window.location.assign("/");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Couldn't start the fresh book.");
    }
  }

  function choosePaper(next: Paper) {
    setPaper(next);
    setPaperState(next);
    pushTheme();
  }

  function chooseInk(next: Ink) {
    setInk(next);
    setInkState(next);
    pushTheme();
  }

  function chooseDay(next: Paper) {
    setDayPaper(next);
    setDayState(next);
    pushTheme();
  }

  function chooseNight(next: Paper) {
    setNightPaper(next);
    setNightState(next);
    pushTheme();
  }

  function chooseCustom(hex: string) {
    setCustomAccent(hex);
    setCustomState(hex);
    setInkState("custom");
    pushTheme();
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await auth.logout();
    } finally {
      onSignOut();
    }
  }

  const chip = (active: boolean) =>
    `chip ${
      active ? "border-accent text-ink" : "border-edge text-ink-mute"
    }`;

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-serif text-2xl font-light">You</h1>
        <p className="text-sm text-ink-mute">Account, appearance, and data.</p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 label-micro">
          Choose your paper
        </h2>
        <div className="flex flex-wrap gap-2">
          {papers.map((option) => (
            <button
              key={option.id}
              onClick={() => choosePaper(option.id)}
              className={chip(paper === option.id)}
            >
              <span
                className="mr-2 inline-block h-2.5 w-2.5 rounded-full border border-edge align-middle"
                style={{ background: option.swatch }}
              />
              {option.label}
            </button>
          ))}
        </div>
        {paper === "system" && (
          <div className="mt-4 space-y-3">
            <div>
              <p className="mb-2 text-xs text-ink-faint">By day</p>
              <div className="flex flex-wrap gap-2">
                {papers
                  .filter((option) => option.shade === "light")
                  .map((option) => (
                    <button
                      key={option.id}
                      onClick={() => chooseDay(option.id)}
                      className={chip(dayPaper === option.id)}
                    >
                      <span
                        className="mr-2 inline-block h-2.5 w-2.5 rounded-full border border-edge align-middle"
                        style={{ background: option.swatch }}
                      />
                      {option.label}
                    </button>
                  ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs text-ink-faint">By night</p>
              <div className="flex flex-wrap gap-2">
                {papers
                  .filter((option) => option.shade === "dark")
                  .map((option) => (
                    <button
                      key={option.id}
                      onClick={() => chooseNight(option.id)}
                      className={chip(nightPaper === option.id)}
                    >
                      <span
                        className="mr-2 inline-block h-2.5 w-2.5 rounded-full border border-edge align-middle"
                        style={{ background: option.swatch }}
                      />
                      {option.label}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 label-micro">Accent ink</h2>
        <div className="flex flex-wrap gap-2">
          {inks.map((option) => (
            <button
              key={option.id}
              onClick={() => chooseInk(option.id)}
              className={chip(ink === option.id)}
            >
              <span
                className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                style={{ background: option.swatch }}
              />
              {option.label}
            </button>
          ))}
          <button
            onClick={() => {
              // Confirming the picker unchanged fires no event, so choose the
              // saved custom accent up front; the picker then fine-tunes it.
              setInk("custom");
              setInkState("custom");
              pushTheme();
              customInput.current?.click();
            }}
            className={chip(ink === "custom")}
          >
            <span
              className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
              style={{ background: customAccent }}
            />
            Your own
          </button>
          <input
            ref={customInput}
            type="color"
            className="sr-only"
            value={customAccent}
            onChange={(e) => chooseCustom(e.target.value)}
            aria-label="Custom accent ink"
          />
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          Your paper &amp; ink follow your account onto every device.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 label-micro">Account</h2>
        <div className="flex items-center justify-between card px-4 py-3">
          <div>
            <p className="text-sm">{user.email}</p>
            <p className="text-xs text-ink-faint">
              {user.isAdmin ? "Instance administrator." : "Member account."}
            </p>
          </div>
          <button
            onClick={signOut}
            disabled={signingOut}
            className="btn-quiet px-4 py-2 text-sm"
          >
            {signingOut ? "…" : "Sign out"}
          </button>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 label-micro">Currency</h2>
        <div className="flex flex-wrap gap-2">
          {currencies.map((code) => (
            <button key={code} onClick={() => chooseCurrency(code)} className={chip(currencyCode === code)}>
              {code}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 label-micro">Budget rollover</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => chooseRollover(false)} className={chip(!rollover)}>
            Each month stands alone
          </button>
          <button onClick={() => chooseRollover(true)} className={chip(rollover)}>
            Carry remainders forward
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          Envelope-style: months you kept the book pass their unspent budget (or overrun) into
          the next.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 label-micro">Savings goals</h2>
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              Pay yourself first
              <span className="block text-xs text-ink-faint">
                the amount to set aside each month
              </span>
            </span>
            <input
              className="field-sm w-28 text-right"
              inputMode="decimal"
              placeholder="none"
              value={savingsTarget}
              onChange={(e) => setSavingsTarget(e.target.value)}
              onBlur={() =>
                patchSettings({ monthlySavingsTarget: Number.parseFloat(savingsTarget) || 0 })
              }
              aria-label="Monthly savings target"
            />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              Savings-rate goal
              <span className="block text-xs text-ink-faint">
                the share of income to keep, tracked on Insights
              </span>
            </span>
            <span className="flex items-center gap-1">
              <input
                className="field-sm w-16 text-right"
                inputMode="numeric"
                placeholder="none"
                value={rateTarget}
                onChange={(e) => setRateTarget(e.target.value)}
                onBlur={() =>
                  patchSettings({ savingsRateTarget: Number.parseInt(rateTarget, 10) || 0 })
                }
                aria-label="Savings rate target"
              />
              <span className="text-ink-faint">%</span>
            </span>
          </label>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-1 label-micro">Coaching</h2>
        <p className="mb-3 text-xs text-ink-faint">
          What FinTrackr watches for. Leave it plain, or turn on a little more.
        </p>
        <div className="divide-y divide-edge card px-4">
          <Toggle
            label="Overspend nudges"
            hint="a gentle note when an entry would push a line over"
            on={overspendNudge}
            onToggle={(v) => {
              setOverspendNudge(v);
              patchSettings({ overspendNudge: v });
            }}
          />
          <Toggle
            label="Worth-it reflection"
            hint="weigh your biggest expenses in the weekly review"
            on={reflection}
            onToggle={(v) => {
              setReflection(v);
              patchSettings({ reflection: v });
            }}
          />
          <Toggle
            label="Spending challenges"
            hint="set a monthly goal: no-spend days, a line under a cap"
            on={challengesOn}
            onToggle={(v) => {
              setChallengesOn(v);
              patchSettings({ challenges: v });
            }}
          />
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 label-micro">Your data</h2>
        <div className="divide-y divide-edge card px-4">
          <Link to="/vendors" className="flex justify-between py-3 text-sm">
            <span>Vendors</span>
            <span className="text-ink-faint">mark once, filed forever ›</span>
          </Link>
          <a href="/api/csv/entries.csv" download className="flex justify-between py-3 text-sm">
            <span>Export the ledger</span>
            <span className="text-ink-faint">CSV ↓</span>
          </a>
          <a href="/api/export" download className="flex justify-between py-3 text-sm">
            <span>Export everything</span>
            <span className="text-ink-faint">the whole book, JSON ↓</span>
          </a>
          <button
            onClick={() => importInput.current?.click()}
            className="flex w-full justify-between py-3 text-sm"
          >
            <span>Import entries</span>
            <span className="text-ink-faint">CSV ↑</span>
          </button>
          <Link to="/import" className="flex justify-between py-3 text-sm">
            <span>Import from your bank</span>
            <span className="text-ink-faint">any CSV, mapped &amp; reviewed ›</span>
          </Link>
          <input
            ref={importInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importCsv(file);
              e.target.value = "";
            }}
          />
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 label-micro">Security</h2>
        <div className="space-y-2">
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Current password"
            className="field"
            value={passwords.current}
            onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="New password (8+ characters)"
            className="field"
            value={passwords.next}
            onChange={(e) => setPasswords({ ...passwords, next: e.target.value })}
          />
          {securityNote && <p className="text-sm text-ink-mute">{securityNote}</p>}
          <button
            onClick={changePassword}
            disabled={!passwords.current || passwords.next.length < 8}
            className="btn-quiet px-4 py-2 text-sm"
          >
            Change password
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <button onClick={freshStart} className="text-sm text-ink-mute">
            Start a fresh book
          </button>
          <button onClick={deleteAccount} className="text-sm text-accent">
            Delete account and all data
          </button>
        </div>
      </section>

      {user.isAdmin && (
        <section className="mb-10">
          <h2 className="mb-3 label-micro">
            Instance (admin)
          </h2>
          <div className="divide-y divide-edge card px-4">
            <a href="/api/admin/database" download className="flex justify-between py-3 text-sm">
              <span>Export the database</span>
              <span className="text-ink-faint">everyone's data, one file ↓</span>
            </a>
            <button
              onClick={async () => {
                const result = await api.adminBackup().catch(() => null);
                window.alert(result ? `Backup written: ${result.file}` : "Backup failed.");
              }}
              className="flex w-full justify-between py-3 text-sm"
            >
              <span>Back up now</span>
              <span className="text-ink-faint">to the backups folder</span>
            </button>
            <button
              onClick={() => restoreInput.current?.click()}
              className="flex w-full justify-between py-3 text-sm"
            >
              <span>Restore a database</span>
              <span className="text-ink-faint">replaces everything ↑</span>
            </button>
            <input
              ref={restoreInput}
              type="file"
              accept=".db"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (
                  !window.confirm(
                    "Replace the live database with this file? Every user's current data is overwritten (a safety backup is taken first).",
                  )
                )
                  return;
                try {
                  await api.restoreDatabase(file);
                  window.location.reload();
                } catch (err) {
                  window.alert(err instanceof Error ? err.message : "Restore failed.");
                }
              }}
            />
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            Nightly backups keep the last seven days in the backups folder.
          </p>
        </section>
      )}

      <section className="border-t border-edge pt-6">
        <p className="label-micro">
          FinTrackr · Edition {__APP_VERSION__}
          {serverVersion && serverVersion !== __APP_VERSION__ && ` · server ${serverVersion}`}
        </p>
      </section>
    </div>
  );
}

function Toggle({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm">{label}</p>
        <p className="text-xs text-ink-faint">{hint}</p>
      </div>
      <button
        onClick={() => onToggle(!on)}
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`chip shrink-0 py-1 ${on ? "border-accent text-ink" : "border-edge text-ink-faint"}`}
      >
        {on ? "On" : "Off"}
      </button>
    </div>
  );
}
