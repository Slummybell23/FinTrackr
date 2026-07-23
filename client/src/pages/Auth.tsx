import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { auth, clearApiCache } from "../lib/api";
import type { AuthUser } from "../lib/types";

export default function Auth({ onSignedIn }: { onSignedIn: (user: AuthUser) => void }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user =
        mode === "login"
          ? await auth.login(email, password)
          : await auth.register(email, password);
      await clearApiCache();
      onSignedIn(user);
      // A brand-new ledger begins with its lines.
      if (mode === "register") navigate("/welcome");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const field =
    "field";

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pt-[max(3rem,env(safe-area-inset-top))] pb-[max(3rem,env(safe-area-inset-bottom))]">
      <header className="mb-10">
        <h1 className="font-serif text-4xl font-light">FinTrackr</h1>
        <p className="mt-2 text-sm text-ink-mute">Sign in, or open a ledger to begin.</p>
      </header>

      <form onSubmit={submit} className="space-y-5">
        <label className="block">
          <span className="mb-1 block label-micro">
            Email
          </span>
          <input
            className={field}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block label-micro">
            Password
          </span>
          <input
            className={field}
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={mode === "register" ? 8 : undefined}
            required
          />
        </label>

        {error && <p className="text-sm text-accent">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="btn-ink w-full py-3"
        >
          {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setError(null);
        }}
        className="mt-6 text-sm text-ink-mute"
      >
        {mode === "login" ? (
          <>
            New here? <span className="text-accent">Open a ledger</span>
          </>
        ) : (
          <>
            Already keeping one? <span className="text-accent">Sign in</span>
          </>
        )}
      </button>
    </div>
  );
}
