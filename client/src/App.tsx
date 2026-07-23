import { useEffect, useRef, useState } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { auth, setCurrency, UNAUTHORIZED_EVENT } from "./lib/api";
import { applyUpdate, SW_UPDATE_EVENT } from "./lib/sw";
import { adoptTheme } from "./lib/theme";
import { UserContext } from "./lib/user";
import type { AuthUser } from "./lib/types";
import AuthPage from "./pages/Auth";
import CategoryDetail from "./pages/CategoryDetail";
import Home from "./pages/Home";
import Welcome from "./pages/Welcome";
import Report from "./pages/Report";
import NewEntry from "./pages/NewEntry";
import Activity from "./pages/Activity";
import Budgets from "./pages/Budgets";
import Goals from "./pages/Goals";
import Debts from "./pages/Debts";
import Recurring from "./pages/Recurring";
import Insights from "./pages/Insights";
import ImportCsv from "./pages/ImportCsv";
import Challenges from "./pages/Challenges";
import Review from "./pages/Review";
import Vendors from "./pages/Vendors";
import VendorDetail from "./pages/VendorDetail";
import YearView from "./pages/YearView";
import You from "./pages/You";

const tabs = [
  { to: "/", label: "Home" },
  { to: "/activity", label: "Activity" },
  { to: "/budgets", label: "Budgets" },
  { to: "/insights", label: "Insights" },
  { to: "/you", label: "You" },
];

export default function App() {
  // undefined = still checking the session, null = signed out.
  const [user, setUserState] = useState<AuthUser | null | undefined>(undefined);
  const [updateReady, setUpdateReady] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const lastG = useRef(0);

  useEffect(() => {
    const onUpdate = () => setUpdateReady(true);
    window.addEventListener(SW_UPDATE_EVENT, onUpdate);
    return () => window.removeEventListener(SW_UPDATE_EVENT, onUpdate);
  }, []);

  function setUser(next: AuthUser | null) {
    if (next) {
      setCurrency(next.currency);
      // The account's paper & ink follow you between devices.
      adoptTheme(next.theme);
    }
    setUserState(next);
  }

  useEffect(() => {
    auth.me().then(setUser).catch(() => setUser(null));
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  // Desktop keyboard shortcuts: n = new entry, / = search, g-then-letter = go.
  useEffect(() => {
    if (!user) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" || el.isContentEditable)) return;

      const goto: Record<string, string> = {
        h: "/", a: "/activity", b: "/budgets", i: "/insights", y: "/you",
      };
      if (lastG.current && Date.now() - lastG.current < 1200 && goto[e.key]) {
        e.preventDefault();
        lastG.current = 0;
        navigate(goto[e.key]);
        return;
      }
      lastG.current = 0;

      if (e.key === "n") {
        e.preventDefault();
        navigate("/new");
      } else if (e.key === "/") {
        e.preventDefault();
        navigate("/activity");
        setTimeout(() => document.getElementById("activity-search")?.focus(), 60);
      } else if (e.key === "g") {
        lastG.current = Date.now();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user, navigate]);

  if (user === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="font-serif text-2xl font-light text-ink-faint">FinTrackr</p>
      </div>
    );
  }

  if (user === null) {
    return <AuthPage onSignedIn={setUser} />;
  }

  // Onboarding and the printed page stand alone, outside the tab-bar shell.
  if (location.pathname === "/welcome") {
    return <Welcome />;
  }
  if (location.pathname.startsWith("/report")) {
    return <Report />;
  }

  return (
    <UserContext.Provider value={user}>
    <div className="lg:flex lg:min-h-dvh">
      {/* Desktop: a quiet sidebar stands in for the bottom tab bar. */}
      <aside className="hidden lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-edge lg:bg-raised/40 lg:px-4 lg:py-8">
        <div className="sticky top-8">
          <h1 className="mb-6 px-2 font-serif text-2xl font-light">FinTrackr</h1>
          <NavLink
            to="/new"
            className="mb-6 flex items-center justify-center btn-ink px-4 py-2.5 text-sm"
          >
            + New entry
          </NavLink>
          <nav className="flex flex-col gap-1">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.to === "/"}
                className={({ isActive }) =>
                  `rounded-lg border-l-2 px-3 py-2 text-sm ${
                    isActive
                      ? "border-accent bg-raised text-ink"
                      : "border-transparent text-ink-mute hover:bg-raised/60"
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
          <p className="mt-8 px-3 text-xs leading-relaxed text-ink-faint">
            <span className="text-ink-mute">n</span> new ·{" "}
            <span className="text-ink-mute">/</span> search ·{" "}
            <span className="text-ink-mute">g</span> then h/a/b/i/y
          </p>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col lg:min-h-dvh lg:flex-1">
        {updateReady && (
          <div className="flex items-center justify-between border-b border-edge bg-raised px-5 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm lg:px-10 lg:pt-2">
            <span className="text-ink-mute">A new edition of FinTrackr is ready.</span>
            <button onClick={applyUpdate} className="text-accent">
              Refresh
            </button>
          </div>
        )}
        <main className="mx-auto w-full max-w-lg flex-1 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-[max(1.5rem,env(safe-area-inset-top))] pb-24 lg:max-w-4xl lg:px-12 lg:pt-12 lg:pb-12">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/new" element={<NewEntry />} />
            <Route path="/entries/:id" element={<NewEntry />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/vendors" element={<Vendors />} />
            <Route path="/vendor/:id" element={<VendorDetail />} />
            <Route path="/year" element={<YearView />} />
            <Route path="/review" element={<Review />} />
            <Route path="/budgets" element={<Budgets />} />
            <Route path="/categories/:id" element={<CategoryDetail />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/debts" element={<Debts />} />
            <Route path="/recurring" element={<Recurring />} />
            <Route path="/challenges" element={<Challenges />} />
            <Route path="/import" element={<ImportCsv />} />
            <Route path="/insights" element={<Insights />} />
            <Route
              path="/you"
              element={<You user={user} onSignOut={() => setUser(null)} onUserChange={setUser} />}
            />
          </Routes>
        </main>

        {/* Mobile: the tab bar rides the bottom; hidden once the sidebar appears. */}
        <nav className="fixed inset-x-0 bottom-0 border-t border-edge bg-paper/95 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-lg justify-between pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.to === "/"}
                className={({ isActive }) =>
                  `px-2 py-1 label-micro ${
                    isActive ? "text-ink border-t-2 border-accent -mt-[2px]" : ""
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
    </UserContext.Provider>
  );
}
